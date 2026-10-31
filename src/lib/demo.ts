import type {State,Container,Item} from './domain.ts';
import {emptyState,today} from './domain.ts';
export function demoState():State{
  const s=emptyState(),now=new Date().toISOString(),date=today();
  const incoming:Container={id:'demo-next',code:'CN-002',name:'حاوية الشتاء القادمة',supplier:'مورد الصين',currency:'ILS',fx:1,eta:date,notes:'مراجعة صور الموديلات وكشف التعبئة قبل وصول الحاوية.',status:'transit',createdAt:now,receivedAt:''};
  const received:Container={...incoming,id:'demo-stock',code:'CN-001',name:'حاوية الموسم الحالي',status:'final',notes:'تكلفة وصول معتمدة · بيانات توضيحية',receivedAt:date+'T08:00:00.000Z'};
  s.containers=[incoming,received];
  const samples=[{model:'BL102',name:'بلوزة قطن',color:'أسود',size:'M',quantity:600,purchase:18,volume:3,weight:150,price:35},{model:'TR205',name:'بنطلون جينز',color:'أزرق',size:'L',quantity:300,purchase:32,volume:2,weight:180,price:55},{model:'JK310',name:'جاكيت شتوي',color:'كحلي',size:'XL',quantity:100,purchase:60,volume:3,weight:120,price:105}];
  for(let n=0;n<samples.length;n++){
    const item:Item={...samples[n],id:'demo-next-'+n,containerId:incoming.id,currency:'ILS',fx:1,barcode:samples[n].model,notes:n===2?'فحص السحّاب والتغليف':'',received:0,damaged:0};
    s.items.push(item);
    s.items.push({...item,id:'demo-stock-'+n,containerId:received.id,quantity:[180,90,25][n],received:[180,90,25][n],purchase:[22,38,78][n]});
  }
  s.costs=[{id:'demo-e1',containerId:incoming.id,name:'مصاريف الصين والتجميع',amount:1200,currency:'ILS',fx:1,basis:'value',target:'',confirmed:false,notes:''},{id:'demo-e2',containerId:incoming.id,name:'الشحن البحري والتأمين',amount:3000,currency:'ILS',fx:1,basis:'volume',target:'',confirmed:false,notes:'التوزيع بالحجم في هذا المثال'},{id:'demo-e3',containerId:incoming.id,name:'التخليص والرسوم والمناولة',amount:1600,currency:'ILS',fx:1,basis:'value',target:'',confirmed:false,notes:''},{id:'demo-e4',containerId:incoming.id,name:'النقل إلى المستودع',amount:800,currency:'ILS',fx:1,basis:'quantity',target:'',confirmed:false,notes:''}];
  ['أزياء النور','مركز الأناقة','معرض الموسم'].forEach((name,n)=>s.customers.push({id:'demo-c'+n,name,phone:'',address:'الخليل',notes:'',opening:0}));
  for(let n=0;n<3;n++){const i=s.items.find(i=>i.id==='demo-stock-'+n)!,quantity=[30,20,10][n],price=[35,55,100][n],total=quantity*price*100;s.sales.push({id:'demo-sale-'+n,number:'INV-0000'+(n+1),date,customerId:'demo-c'+n,lines:[{key:[i.model,i.color,i.size].map(v=>v.toLowerCase()).join('|'),model:i.model,name:i.name,color:i.color,size:i.size,quantity,price,gross:total,net:total,allocations:[{itemId:i.id,quantity}]}],discount:0,total,paid:n===0?0:total,method:n===0?'credit':n===1?'cash':'bank',delivery:0,notes:'',createdAt:now,voided:false,voidReason:''});}
  return s;
}
