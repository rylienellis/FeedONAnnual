interface StatisticsResponse {
   dummy: "1" | string,
   year: "2016" | "2017" | "2018" | "2019" | string,
   value: number
 } 
  
interface ChartData {
  col: number,
  row: number,
  value: number
}

interface CellHighlight {
  col: number,
  row: number
}
