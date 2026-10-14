export type PaperSize = "A4" | "Letter" | "Legal";
export interface FormSignature {name:string;date:string}
export interface DocumentItemSnapshot { stockNo:string; description:string; unit:string; }
export interface CommonFormFields { entityName?: string; fundCluster?: string; paper?: PaperSize; }
export interface IARFormFields extends CommonFormFields {
  signatures?:Record<string,FormSignature>;
  office?: string; responsibilityCode?: string; poReference?: string; poDate?: string;
  invoiceNumber?: string; invoiceDate?: string; inspectionDate?: string; receivedDate?: string;
  acceptance?: "" | "Complete" | "Partial"; inspectionConforms?: boolean;
}
export interface RISFormFields extends CommonFormFields {
  signatures?:Record<string,FormSignature>;
  division?: string; office?: string; responsibilityCode?: string; purpose?: string;
  requestedDesignation?: string; approvedDesignation?: string; issuedDesignation?: string; receivedDesignation?: string;
  requestedDate?: string; approvedDate?: string; issuedDate?: string; receivedDate?: string;
  remarks?: Record<string, string>;
}
export interface StockCardFormFields extends CommonFormFields {
  unitLabel?: string; offices?: Record<string, string>; days?: Record<string, string>;
}
