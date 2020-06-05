import esri = __esri;

import EsriMap = require("esri/Map");
import MapView = require("esri/views/MapView");
import FeatureLayer = require("esri/layers/FeatureLayer");
import FeatureFilter = require("esri/views/layers/support/FeatureFilter");
import FeatureEffect = require("esri/views/layers/support/FeatureEffect");
import StatisticDefinition = require("esri/tasks/support/StatisticDefinition");
import { Extent } from "esri/geometry";
import { SimpleFillSymbol } from "esri/symbols";
import { SimpleRenderer } from "esri/renderers";
import { updateGrid } from "./heatmapChart";

import Expand = require("esri/widgets/Expand");
import { dummies, years } from "./constants";

( async () => {

  const layer = new FeatureLayer({
    portalItem: {
      id: "38c403f3896f427cb491168958162f16"
    },
    outFields: [ "*" ],
    popupTemplate: {
      title: "{ENGLISH_NA} | {YearString}",
      expressionInfos: [
        {
          name: "1in1000",
          title: "1in1000 Popup",
          expression: "Round((($feature.UniqueIndividuals_perc)*10),1)"
        }
      ],

      content:[
        {
          type: "text",
          text:
            "In this electoral riding, {expression/1in1000} out of 1000 people accessed a food bank this year."
        },
        {
          type: "fields",
          fieldInfos: [
            {
              fieldName: "Pop2016",
              label: "Total Population (2016)",
              format: {
                digitSeparator: true,
                places: 0
              }
            },
            {
              fieldName: "UniqueIndividuals_cnt",
              label: "Total unique visits",
              format: {
                digitSeparator: true,
                places: 0
              }
            }
          ]
        },
        {
          type: "media", //MediaContentElement for chart
          mediaInfos: [
            {
              title: "<b>Housing</b>",
              type: "pie-chart",
              caption: "",
              value: {
                fields: ["Band_Owned", "Emergency_Shelter", "On_the_Street", "Rooming_House", "Own_Home", "Private_Rental", "Social_Housing", "Family_or_Friends", "Youth_Home_Shelter", "Unknown_Housing"],
                normalizeField: null
              }
            }
          ]
        },
        {
          type: "media",
          mediaInfos: [
            {
              title: "<b>Primary Source of Income</b>",
              type: "pie-chart",
              caption: "",
              value: {
                fields: ["Canada_Child_Benefit", "Disability_Benefits", "Employment", "Employment_Insurance", "No_Income", "Pension", "Provincial_Disability", "Social_Assistance", "Student_Loan", "Unknown_Income"],
                normalizeField: null
              }
            }
          ]
        }     
      ]
    }
  });

  const districtsLayer = new FeatureLayer({
    title: "districts",
    portalItem: {
      id: "38c403f3896f427cb491168958162f16"
    },
    popupTemplate: null,
    opacity: 0,
    renderer: new SimpleRenderer({
      symbol: new SimpleFillSymbol({
        color: [ 0,0,0,1 ],
        outline: null
      })
    })
  });

  const map = new EsriMap({
    basemap: "gray-vector",
    layers: [ layer, districtsLayer ]
  });

  const view = new MapView({
    map: map,
    container: "viewDiv",
    center: [ -85, 50 ],
    zoom: 4.5,
    highlightOptions: {
      color: "#262626",
      haloOpacity: 1,
      fillOpacity: 0
    }
  });

  await view.when();
  const chartExpand = new Expand({
    view,
    content: document.getElementById("chartDiv"),
    expandIconClass: "esri-icon-chart",
    group: "top-left"
  });
  view.ui.add(chartExpand, "top-left");
  view.ui.add("logoDiv", "bottom-right");

  const layerView = await view.whenLayerView(layer) as esri.FeatureLayerView;
  const districtsLayerView = await view.whenLayerView(districtsLayer) as esri.FeatureLayerView;

  const layerStats = await queryLayerStatistics(layer);
  updateGrid(layerStats, layerView);

  function resetOnCollapse (expanded:boolean) {
    if (!expanded){
      resetVisuals();
    }
  }

  chartExpand.watch("expanded", resetOnCollapse);

  let highlight:any = null;
  view.on("drag", ["Control"], eventListener);
  view.on("click", ["Control"], eventListener);
  let previousId: number;
  async function eventListener (event:any) {
    event.stopPropagation();

    const hitResponse = await view.hitTest(event);
    const hitResults = hitResponse.results.filter( hit => hit.graphic.layer === districtsLayer );
    if(hitResults.length > 0){
      const graphic = hitResults[0].graphic;
      if(previousId !== graphic.attributes.FID){
        previousId = graphic.attributes.FID;
        if (highlight) {
          highlight.remove();
          highlight = null;
        }
        
        highlight = districtsLayerView.highlight([previousId]);
        const geometry = graphic && graphic.geometry;
        let queryOptions = {
          geometry,
          spatialRelationship: "intersects"
        };

        const filterOptions = new FeatureFilter(queryOptions);

        layerView.effect = new FeatureEffect({
          filter: filterOptions,
          excludedEffect: "grayscale(90%) opacity(15%)"
        });

        const stats = await queryTimeStatistics(layerView, queryOptions);
        updateGrid(stats);
      }
    }
  }

  interface QueryTimeStatsParams {
    geometry?: esri.Geometry,
    distance?: number,
    units?: string
  }

  async function queryTimeStatistics ( layerView: esri.FeatureLayerView, params: QueryTimeStatsParams): Promise<ChartData[]>{
    const { geometry, distance, units } = params;

    const query = layerView.layer.createQuery();

    query.outStatistics = [
      new StatisticDefinition({
        onStatisticField: "Total_visits",
        outStatisticFieldName: "value",
        statisticType: "sum"
      })
    ];
    query.groupByFieldsForStatistics = [ "YearString + '-' + Dummy" ];
    query.geometry = geometry;
    query.distance = distance;
    query.units = units;
    query.returnQueryGeometry = true;

    const queryResponse = await layerView.queryFeatures(query);

    const responseChartData = queryResponse.features.map( feature => {
      const timeSpan = feature.attributes["EXPR_1"].split("-");
      const year = timeSpan[0];
      const dummy = timeSpan[1];
      return {
        dummy,
        year, 
        value: feature.attributes.value
      };
    });
    return createDataObjects(responseChartData);
  }

  async function queryLayerStatistics(layer: esri.FeatureLayer): Promise<ChartData[]> {
    const query = layer.createQuery();
    query.outStatistics = [
      new StatisticDefinition({
        onStatisticField: "Total_visits",
        outStatisticFieldName: "value",
        statisticType: "sum"
      })
    ];
    query.groupByFieldsForStatistics = [ "YearString + '-' + Dummy" ];

    const queryResponse = await layer.queryFeatures(query);

    const responseChartData = queryResponse.features.map( feature => {
      const timeSpan = feature.attributes["EXPR_1"].split("-");
      const year = timeSpan[0];
      const dummy = timeSpan[1];
      return {
        dummy,
        year, 
        value: feature.attributes.value
      };
    });
    return createDataObjects(responseChartData);
  }

  function createDataObjects(data: StatisticsResponse[]): ChartData[] {
    let formattedChartData: ChartData[] = [];

    months.forEach( (year, s) => {
      years.forEach( (dummy, t) => {

        const matches = data.filter( datum => {
          return datum.year === year && datum.dummy === dummy;
        });

        formattedChartData.push({
          col: t,
          row: s,
          value: matches.length > 0 ? matches[0].value : 0
        });

      });
    });

    return formattedChartData;
  }

  const resetBtn = document.getElementById("resetBtn");
  resetBtn.addEventListener("click", resetVisuals);

  function resetVisuals () {
    layerView.filter = null;
    layerView.effect = null;
    if(highlight){
      highlight.remove();
      highlight = null;
    }
    
    updateGrid(layerStats, layerView, true);
  }

})();
