import type {Item} from './domain.ts';

export const productSearchColumns={
  model:'رقم الموديل',
  barcode:'الباركود',
  name:'اسم الصنف',
  color:'اللون',
  size:'المقاس',
} as const;

type ProductColumn=keyof typeof productSearchColumns;
export type ProductSearchOptions={
  column:'all'|ProductColumn;
  mode:'contains'|'exact';
};
export const defaultProductSearch:ProductSearchOptions={column:'all',mode:'contains'};

export function normalizeSearch(value:string) {
  return value.toLowerCase().normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/[\u064b-\u065f]/g,'');
}

export function productMatcher(query:string,{column,mode}:ProductSearchOptions) {
  const cleaned=normalizeSearch(query).trim();
  const columns=column==='all'?Object.keys(productSearchColumns) as ProductColumn[]:[column];
  return (item:Pick<Item,ProductColumn>)=>!cleaned||columns.some(field=>{
    const value=normalizeSearch(item[field]).trim();
    return mode==='exact'?value===cleaned:value.includes(cleaned);
  });
}
