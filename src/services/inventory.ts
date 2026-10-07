export interface InventoryItem {
  id: string; code: string; name: string; category: string; description: string; brand: string; model: string;
  unit: string; quantity: number; minimum: number; supplier: string; supplierId: string; location: string; bin: string;
  active: boolean; serials?: string[];
}
export interface InventoryTransaction {
  id: string; date: string; reference: string; itemId: string; itemName: string; type: string; quantity: number;
  previous: number; next: number; performedBy: string; remarks: string;
}
export const categories = ["Pipes & Fittings","Water Meters","Valves","Tools","Electrical Supplies","Plumbing Supplies","Safety Equipment","Office/Operational Supplies"];
const row = (id:string,code:string,name:string,category:string,brand:string,model:string,unit:string,quantity:number,minimum:number,location:string,bin:string,active=true): InventoryItem => ({
  id,code,name,category,brand,model,unit,quantity,minimum,location,bin,active,description:`Standard ${name.toLowerCase()} for WDS maintenance and field operations.`,supplier:"Metro Waterworks Supply",supplierId:"SUP-001",serials:[]
});
export const initialItems: InventoryItem[] = [
  row("i1","MAT-001",'PVC Pipe 1/2"',"Pipes & Fittings","Neltex","Series 1000","pcs",150,50,"Main Warehouse","Rack A-01"),
  row("i2","MAT-002",'PVC Elbow 1/2"',"Pipes & Fittings","Emerald","Standard","pcs",18,20,"Main Warehouse","Rack A-02"),
  row("i3","EQP-001","Water Meter 20mm","Water Meters","Kent","Multijet","pcs",0,10,"Meter Room","Shelf M-01"),
  row("i4","VAL-001","Gate Valve 2 inch","Valves","AVK","Resilient Seat","pcs",24,10,"Main Warehouse","Rack B-03"),
  row("i5","TLS-001","Pipe Wrench 14 inch","Tools","Ridgid","31020","pcs",8,5,"Tool Cage","Cabinet T-02"),
  row("i6","MAT-003","PVC Tee 3/4 inch","Pipes & Fittings","Neltex","Standard","pcs",12,20,"Main Warehouse","Rack A-04"),
  row("i7","ELC-001","THHN Wire 2.0mm","Electrical Supplies","Phelps Dodge","THHN","rolls",32,12,"Electrical Store","Rack E-01"),
  row("i8","SAF-001","Safety Helmet","Safety Equipment","3M","H-700","pcs",45,15,"Safety Room","Shelf S-01"),
  row("i9","PLB-001","Teflon Tape","Plumbing Supplies","Lotus","12mm","pcs",210,60,"Main Warehouse","Bin P-04"),
  row("i10","EQP-002","Pressure Gauge 100 PSI","Water Meters","Wika","111.10","pcs",4,5,"Meter Room","Shelf M-04"),
  row("i11","VAL-002","Check Valve 1 inch","Valves","Kitz","Swing Type","pcs",15,8,"Main Warehouse","Rack B-01"),
  row("i12","TLS-002","Adjustable Wrench 12 inch","Tools","Stanley","MaxSteel","pcs",3,4,"Tool Cage","Cabinet T-01"),
  row("i13","SAF-002","Reflective Safety Vest","Safety Equipment","SafeGuard","Class 2","pcs",64,20,"Safety Room","Shelf S-02"),
  row("i14","OPS-001","Meter Reading Form","Office/Operational Supplies","WDS","Form 14-B","boxes",6,5,"Admin Store","Shelf O-01"),
  row("i15","MAT-004","HDPE Pipe 25mm","Pipes & Fittings","Atlanta","PE100","meters",580,100,"Pipe Yard","Bay P-02"),
  row("i16","EQP-003","Digital Clamp Meter","Electrical Supplies","Fluke","323","pcs",0,2,"Electrical Store","Cabinet E-03"),
  row("i17","PLB-002","Pipe Sealant Compound","Plumbing Supplies","Boss","White 400g","pcs",10,10,"Main Warehouse","Bin P-08"),
  row("i18","TLS-003","Manual Pipe Threader Set","Tools","Tolsen","6-pc Set","sets",2,2,"Tool Cage","Cabinet T-05",false),
  row("i19","VAL-003","Butterfly Valve 4 inch","Valves","AVK","Wafer Type","pcs",9,3,"Main Warehouse","Rack B-06"),
  row("i20","SAF-003","Nitrile Work Gloves","Safety Equipment","Ansell","HyFlex","boxes",28,10,"Safety Room","Shelf S-04"),
];
export const statusFor = (item:InventoryItem) => !item.active ? "Inactive" : item.quantity === 0 ? "Out of Stock" : item.quantity <= item.minimum ? "Low Stock" : "Available";
const tx = (id:string,date:string,reference:string,itemId:string,itemName:string,type:string,quantity:number,previous:number,next:number,performedBy:string,remarks:string):InventoryTransaction => ({id,date,reference,itemId,itemName,type,quantity,previous,next,performedBy,remarks});
export const initialTransactions: InventoryTransaction[] = [
  tx("t1","2025-06-18T09:24:00","INV-00142","i1",'PVC Pipe 1/2"',"Stock In",100,50,150,"Juan Dela Cruz","Delivery from Metro Waterworks Supply"),
  tx("t2","2025-06-18T08:41:00","INV-00141","i3","Water Meter 20mm","Stock Out",-5,5,0,"Maria Santos","Released for Zone 4 meter installation"),
  tx("t3","2025-06-17T15:20:00","INV-00140","i2",'PVC Elbow 1/2"',"Return",10,8,18,"Juan Dela Cruz","Unused materials returned by maintenance team"),
  tx("t4","2025-06-17T11:05:00","INV-00139","i10","Pressure Gauge 100 PSI","Damaged",-2,6,4,"Pedro Reyes","Damaged during field pressure test"),
  tx("t5","2025-06-16T14:10:00","INV-00138","i8","Safety Helmet","Stock In",20,25,45,"Maria Santos","Quarterly PPE replenishment"),
  tx("t6","2025-06-16T10:32:00","INV-00137","i6","PVC Tee 3/4 inch","Stock Out",-8,20,12,"Juan Dela Cruz","North line repair works"),
  tx("t7","2025-06-15T13:18:00","INV-00136","i9","Teflon Tape","Adjustment",10,200,210,"Ana Lopez","Physical count reconciliation"),
  tx("t8","2025-06-14T09:50:00","INV-00135","i12","Adjustable Wrench 12 inch","Lost",-1,4,3,"Pedro Reyes","Reported missing after field assignment"),
  tx("t9","2025-06-13T16:12:00","INV-00134","i15","HDPE Pipe 25mm","Stock In",300,280,580,"Juan Dela Cruz","Project stock delivery"),
];

// Firebase-ready service boundary. Replace these implementations with collection calls later.
export async function getInventoryItems(){ return [...initialItems]; }
export async function addInventoryItem(item:InventoryItem){ return item; }
export async function updateInventoryItem(item:InventoryItem){ return item; }
export async function createStockTransaction(transaction:InventoryTransaction){ return transaction; }
export async function getTransactions(){ return [...initialTransactions]; }
export async function getStockTrail(){ return [...initialTransactions]; }
