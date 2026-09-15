import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/authMiddleware.ts';
import { apiLimiter } from '../middleware/rateLimitMiddleware.ts';
import { handler,success,ApiError } from '../shared/http.ts';
const router=Router();router.use(requireAuth,apiLimiter);
const lat=z.coerce.number().min(-90).max(90),lng=z.coerce.number().min(-180).max(180);
const cache=new Map<string,{expires:number;data:unknown}>();
function remember(key:string,data:unknown){if(cache.size>=256)cache.delete(cache.keys().next().value!);cache.set(key,{expires:Date.now()+60000,data});return data;}
async function upstream(url:string,options?:RequestInit){
  try{const response=await fetch(url,{...options,signal:AbortSignal.timeout(8000),headers:{'User-Agent':'SafeAlert/2.0',...options?.headers}});if(!response.ok)throw new Error();return await response.json() as unknown;}
  catch{throw new ApiError(503,'MAP_PROVIDER_UNAVAILABLE','Map service is unavailable. Try again shortly.');}
}
router.get('/facilities/nearby',handler(async(req,res)=>{
  const input=z.object({lat,lng,type:z.enum(['hospital','fire_station','police']).default('hospital'),radius:z.coerce.number().int().min(100).max(10000).default(5000)}).parse(req.query);
  const key=JSON.stringify(input);const stored=cache.get(key);if(stored&&stored.expires>Date.now())return success(res,stored.data);
  const endpoint=process.env.OVERPASS_URL;if(!endpoint)throw new ApiError(503,'MAP_PROVIDER_NOT_CONFIGURED','Nearby facilities are not configured yet.');
  const query=`[out:json][timeout:7];nwr[amenity="${input.type}"](around:${input.radius},${input.lat},${input.lng});out center 100;`;
  const response=z.object({elements:z.array(z.object({id:z.number(),type:z.string(),lat:z.number().optional(),lon:z.number().optional(),center:z.object({lat:z.number(),lon:z.number()}).optional(),tags:z.record(z.string()).optional()}))}).parse(await upstream(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query})}));
  const facilities=response.elements.flatMap(element=>{const point=element.center||{lat:element.lat,lon:element.lon};return point.lat===undefined||point.lon===undefined?[]:[{id:`${element.type}/${element.id}`,name:element.tags?.name||input.type.replace('_',' '),type:input.type,lat:point.lat,lng:point.lon,address:element.tags?.['addr:street'],phone:element.tags?.phone}];});
  return success(res,remember(key,{facilities,attribution:'© OpenStreetMap contributors'}));
}));
router.get('/routes',handler(async(req,res)=>{
  const input=z.object({fromLat:lat,fromLng:lng,toLat:lat,toLng:lng}).parse(req.query);
  const endpoint=process.env.ROUTING_URL;if(!endpoint)throw new ApiError(503,'MAP_PROVIDER_NOT_CONFIGURED','Route guidance is not configured yet.');
  const url=`${endpoint.replace(/\/$/,'')}/route/v1/driving/${input.fromLng},${input.fromLat};${input.toLng},${input.toLat}?overview=full&geometries=geojson`;
  const response=z.object({code:z.string(),routes:z.array(z.object({distance:z.number(),duration:z.number(),geometry:z.object({coordinates:z.array(z.tuple([z.number(),z.number()]))})})).optional()}).parse(await upstream(url));
  const route=response.routes?.[0];if(response.code!=='Ok'||!route)throw new ApiError(404,'NO_ROUTE','No route is available for these locations.');
  return success(res,{coordinates:route.geometry.coordinates.map(([lng,lat])=>({lat,lng})),distanceMeters:route.distance,durationSeconds:route.duration,attribution:'© OpenStreetMap contributors'});
}));
export default router;
