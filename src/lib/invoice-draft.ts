import type {Sale,SaleLine} from './domain.ts';

export type InvoiceDraftLine=Pick<SaleLine,'key'|'quantity'|'price'>&{
  id:string;
  sourceItem?:Pick<SaleLine,'model'|'name'|'color'|'size'>;
};

export function invoiceDraftFromSale(sale:Sale) {
  const lines:InvoiceDraftLine[]=sale.lines.map((line,index)=>({
    id:'imported-'+index,
    key:line.key,
    quantity:line.quantity,
    price:line.price,
    sourceItem:{model:line.model,name:line.name,color:line.color,size:line.size},
  }));
  return {customerId:sale.customerId,lines};
}

export function draftQuantities(lines:readonly Pick<SaleLine,'key'|'quantity'>[]) {
  const quantities=new Map<string,number>();
  for(const {key,quantity} of lines) quantities.set(key,(quantities.get(key)??0)+quantity);
  return quantities;
}
