export function displayDate(value:string):string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)?`${value.slice(5,7)}/${value.slice(8,10)}/${value.slice(0,4)}`:value;
}
export function parseDisplayDate(value:string):string|null {
  if(value==="")return "";
  const match=value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!match)return null;
  const month=Number(match[1]),day=Number(match[2]),year=Number(match[3]);
  if(year<1||month<1||month>12||day<1)return null;
  const leap=year%4===0&&(year%100!==0||year%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  return day>days[month-1]?null:`${match[3]}-${match[1]}-${match[2]}`;
}
