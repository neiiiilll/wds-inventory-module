export function formatDecimal(value:string):string{
 const match=/^(-?)(\d+)(?:\.(\d+))?$/.exec(value)
 if(!match)return value
 const grouped=match[2].replace(/\B(?=(\d{3})+(?!\d))/g,',')
 const fraction=(match[3]??'').replace(/0+$/,'')
 return `${match[1]}${grouped}${fraction?`.${fraction}`:''}`
}
