// Metadata-only deployment. No business documents are read or modified.
import { readFile } from 'node:fs/promises';
import { GoogleAuth } from 'google-auth-library';
try {
process.loadEnvFile('.env.local');
const project=process.env.FIREBASE_ADMIN_PROJECT_ID;
const configured=JSON.parse(await readFile('.firebaserc','utf8')).projects.default;
if(project!==configured)throw Error('Firebase project mismatch');
const client=await new GoogleAuth({credentials:{client_email:process.env.FIREBASE_ADMIN_CLIENT_EMAIL,private_key:process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/cloud-platform']}).getClient();
const desired=JSON.parse(await readFile('firestore.indexes.json','utf8')).indexes;
const apply=process.argv.includes('--apply');
const signature=i=>JSON.stringify({queryScope:i.queryScope,fields:i.fields.map(f=>({fieldPath:f.fieldPath,...(f.order?{order:f.order}:{arrayConfig:f.arrayConfig})}))});
for(const group of ['cost_material_requests','cost_material_receipts']){
  const url=`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/${group}/indexes`;
  const existing=(await client.request({url,timeout:30000})).data.indexes??[];
  for(const index of desired.filter(i=>i.collectionGroup===group)){
    const found=existing.find(i=>signature(i)===signature(index));
    if(found){console.log(JSON.stringify({group,state:found.state,index:found.name}));continue;}
    if(!apply){console.log(JSON.stringify({group,state:'MISSING',fields:index.fields}));continue;}
    const {data}=await client.request({url,method:'POST',data:{queryScope:index.queryScope,fields:index.fields},timeout:30000});
    console.log(JSON.stringify({group,state:'CREATION_REQUESTED',operation:data.name}));
  }
}
} catch (error) { console.error(JSON.stringify({failed:true,status:error.response?.status,message:error.response?.data?.error?.message??error.message})); process.exitCode=1; }
