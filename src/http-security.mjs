import { randomUUID } from 'node:crypto';

const LOOPBACK_HOSTS=new Set(['127.0.0.1','localhost','::1']);

export const RHYMELAB_CSP=[
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ');

export class HttpError extends Error{
  constructor(statusCode,message,code='request_error'){
    super(message);
    this.name='HttpError';
    this.statusCode=statusCode;
    this.code=code;
    this.expose=statusCode>=400&&statusCode<500;
  }
}

export function createHttpError(statusCode,message,code){
  return new HttpError(statusCode,message,code);
}

function normalizeHost(host){
  return String(host||'').trim().replace(/^\[|\]$/g,'').toLowerCase();
}

export function isLoopbackHost(host){
  return LOOPBACK_HOSTS.has(normalizeHost(host));
}

export function isLoopbackAddress(address){
  const normalized=String(address||'').trim().toLowerCase();
  return normalized==='127.0.0.1'
    ||normalized==='::1'
    ||normalized==='::ffff:127.0.0.1';
}

export function isAllowedLocalMutationRequest(req,{port=3030}={}){
  const fetchSite=String(req?.headers?.['sec-fetch-site']||'').trim().toLowerCase();
  if(fetchSite==='cross-site')return false;

  const origin=String(req?.headers?.origin||'').trim();
  if(!origin)return isLoopbackAddress(req?.socket?.remoteAddress);
  if(origin==='null')return false;

  try{
    const parsed=new URL(origin);
    const originPort=parsed.port||(
      parsed.protocol==='http:'?'80':
        parsed.protocol==='https:'?'443':''
    );
    return parsed.protocol==='http:'
      &&isLoopbackHost(parsed.hostname)
      &&originPort===String(port);
  }catch{
    return false;
  }
}

export function allowedRemoteHostsFromEnv(env=process.env){
  return [...new Set(
    String(env.RHYMELAB_ALLOWED_HOSTS||'')
      .split(',')
      .map(normalizeHost)
      .filter(Boolean)
  )];
}

export function assertSafeServerBinding({host,env=process.env}={}){
  const normalizedHost=normalizeHost(host);
  if(isLoopbackHost(normalizedHost))return {remote:false,allowedHosts:[]};
  if(String(env.RHYMELAB_ALLOW_REMOTE||'').trim()!=='1'){
    throw new Error(
      'Refusing non-loopback bind without RHYMELAB_ALLOW_REMOTE=1. '
      +'RhymeLab is local-only by default.'
    );
  }

  const wildcard=normalizedHost==='0.0.0.0'||normalizedHost==='::';
  const allowedHosts=allowedRemoteHostsFromEnv(env);
  if(!wildcard&&normalizedHost&&!allowedHosts.includes(normalizedHost)){
    allowedHosts.push(normalizedHost);
  }
  if(wildcard&&allowedHosts.length===0){
    throw new Error(
      'Wildcard remote binding requires RHYMELAB_ALLOWED_HOSTS with explicit hostnames or IP addresses.'
    );
  }
  return {remote:true,allowedHosts};
}

export function isAllowedRequestHost(req,{remote=false,allowedRemoteHosts=[],port=null}={}){
  const raw=String(req?.headers?.host||'').trim();
  if(!raw)return false;
  try{
    const parsed=new URL(`http://${raw}`);
    const hostname=normalizeHost(parsed.hostname);
    if(port!=null){
      const requestPort=parsed.port||'80';
      if(requestPort!==String(port))return false;
    }
    if(isLoopbackHost(hostname))return true;
    if(!remote)return false;
    const allowed=new Set(allowedRemoteHosts.map(normalizeHost).filter(Boolean));
    return allowed.has(hostname);
  }catch{
    return false;
  }
}

export function isCrossSiteBrowserRequest(req){
  return String(req?.headers?.['sec-fetch-site']||'').trim().toLowerCase()==='cross-site';
}

export function securityHeaders({contentType='',isHtml=false,requestId=null}={}){
  const headers={
    'x-content-type-options':'nosniff',
    'x-xss-protection':'0',
    'referrer-policy':'no-referrer',
    'x-frame-options':'DENY',
    'cross-origin-opener-policy':'same-origin',
    'cross-origin-resource-policy':'same-origin',
    'origin-agent-cluster':'?1',
    'x-permitted-cross-domain-policies':'none',
    'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), midi=()',
  };
  if(contentType)headers['content-type']=contentType;
  if(isHtml)headers['content-security-policy']=RHYMELAB_CSP;
  if(requestId)headers['x-request-id']=String(requestId);
  return headers;
}

export function createRequestId(){
  return randomUUID();
}

export function validateRequestTarget(rawTarget,{maxBytes=16*1024}={}){
  const value=String(rawTarget||'/');
  if(Buffer.byteLength(value,'utf8')>maxBytes){
    throw createHttpError(414,'Request target too large.','request_target_too_large');
  }
  if(value.includes('\r')||value.includes('\n')||value.includes('\0')){
    throw createHttpError(400,'Invalid request target.','invalid_request_target');
  }
  return value;
}

function urlHost(host){
  const normalized=String(host||'127.0.0.1').trim().replace(/^\[|\]$/g,'');
  return normalized.includes(':')?`[${normalized}]`:normalized;
}

export function requestUrlFromTrustedBase(rawTarget,{host='127.0.0.1',port=3030}={}){
  const target=validateRequestTarget(rawTarget);
  return new URL(target,`http://${urlHost(host)}:${Number(port)||3030}`);
}

function jsonContentType(value){
  const type=String(value||'').split(';',1)[0].trim().toLowerCase();
  return type==='application/json'||type.endsWith('+json');
}

export async function readJsonRequestBody(req,{maxBytes=32*1024}={}){
  const contentType=req?.headers?.['content-type'];
  if(contentType&&!jsonContentType(contentType)){
    throw createHttpError(415,'Content-Type must be application/json.','unsupported_media_type');
  }

  const declared=Number(req?.headers?.['content-length']);
  if(Number.isFinite(declared)&&declared>maxBytes){
    throw createHttpError(413,'Request body too large.','request_body_too_large');
  }

  let size=0;
  const chunks=[];
  for await(const chunk of req){
    const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    size+=buffer.length;
    if(size>maxBytes){
      throw createHttpError(413,'Request body too large.','request_body_too_large');
    }
    chunks.push(buffer);
  }

  const raw=Buffer.concat(chunks).toString('utf8').trim();
  if(!raw){
    throw createHttpError(400,'Request body is required.','request_body_required');
  }
  try{
    return JSON.parse(raw);
  }catch{
    throw createHttpError(400,'Request body contains invalid JSON.','invalid_json');
  }
}

export function publicHttpError(error,{requestId=null}={}){
  const numeric=Number(error?.statusCode);
  const statusCode=Number.isInteger(numeric)&&numeric>=400&&numeric<=599?numeric:500;
  const expose=error?.expose===true||(statusCode>=400&&statusCode<500);
  const body={
    error:expose
      ?String(error?.message||'Request failed.')
      :statusCode===503
        ?'Service unavailable.'
        :'Internal server error.',
    code:expose
      ?String(error?.code||'request_error')
      :statusCode===503
        ?'service_unavailable'
        :'internal_error',
  };
  if(requestId)body.requestId=String(requestId);
  if(expose&&error?.runtimeDb)body.runtimeDb=String(error.runtimeDb);
  return {statusCode,body,expose};
}
