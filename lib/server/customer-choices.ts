import type { Firestore } from "firebase-admin/firestore";
import { buildCustomerChoices } from "../customer-choices";
import { normalizeCustomerPhone } from "../concert-customers";
export async function listCustomerChoices(db:Firestore){
  const [profiles,concerts]=await Promise.all([db.collection("concert_customers").get(),db.collection("concerts").get()]);
  return buildCustomerChoices(profiles.docs.map(doc=>({id:doc.id,...doc.data()})),concerts.docs.map(doc=>({id:doc.id,...doc.data()})));
}
export async function customerPhoneOwners(db:Firestore,phone:string){
  if(!phone)return [];
  const results=await Promise.all([db.collection("concert_customers").where("phoneKeys","array-contains",phone).limit(2).get(),db.collection("concert_customers").where("primaryPhone","==",phone).limit(2).get(),db.collection("concert_customers").where("secondaryPhone","==",phone).limit(2).get()]);
  const owners=[...new Set(results.flatMap(snap=>snap.docs.map(doc=>doc.id)))];
  if(owners.length)return owners;
  // Older events may not have a customer profile yet, or may store +966/Arabic
  // digits. Resolve those before treating a typed number as a new customer.
  return (await listCustomerChoices(db)).filter(choice=>[choice.primaryPhone,choice.secondaryPhone].some(value=>normalizeCustomerPhone(value)===phone)).map(choice=>choice.id);
}
