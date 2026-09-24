const LOOPBACK_HOSTS=new Set(['127.0.0.1','localhost','::1']);

export const RHYMELAB_HTML_CSP=[
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'none'",
].join('; ');

function normalizeHostname(value){
  const host=String(value||'').trim().toLocaleLowerCase('en-US');
  return host.startsWith('[')&&host.endsWith(']')?host.slice(1,-1):host;
}

export function isLoopbackHost(value){
  return LOOPBACK_HOSTS.has(normalizeHostname(value));
}

export function parseAllowedHosts(env=process.env){
  return new Set(
    String(env.RHYMELAB_ALLOWED_HOSTS||'')
      .split(',')
      .map(normalizeHostname)
      .filter(Boolean),
  );
}

export function remoteBindingAllowed(env=process.env){
  return String(env.RHYMELAB_ALLOW_REMOTE||'').trim()==='1';
}

export function assertSafeBindHost(host,{env=process.env}={}){
  const normalized=normalizeHostname(host);
  if(isLoopbackHost(normalized))return normalized;
  if(!remoteBindingAllowed(env)){
    throw new Error(
      'Refusing non-loopback bind. Set RHYMELAB_ALLOW_REMOTE=1 and RHYMELAB_ALLOWED_HOSTS explicitly to expose RhymeLab beyond localhost.'
    );
  }
  const allowed=parseAllowedHosts(env);
  const wildcard=normalized==='0.0.0.0'||normalized==='::';
  if(wildcard&&allowed.size===0){
    throw new Error(
      'Remote wildcard binding requires RHYMELAB_ALLOWED_HOSTS with explicit hostnames or IP addresses.'
    );
  }
  return normalized;
}

function expectedPortMatches(parsed,port){
  const requestPort=String(parsed.port||'');
  if(requestPort)return requestPort===String(port);
  return Number(port)===80;
}

function hostnamesAllowedForServer(host,env){
  const normalized=normalizeHostname(host);
  if(isLoopbackHost(normalized))return new Set(LOOPBACK_HOSTS);
  const allowed=parseAllowedHosts(env);
  if(normalized!=='0.0.0.0'&&normalized!=='::')allowed.add(normalized);
  return allowed;
}

function parseAuthority(value){
  const authority=String(value||'').trim();
  if(!authority)return null;
  try{
    const parsed=new URL('http://'+authority);
    return {
      hostname:normalizeHostname(parsed.hostname),
      port:parsed.port,
    };
  }catch{
    return null;
  }
}

export function isAllowedRequestHost(req,{host,port,env=process.env}={}){
  const parsed=parseAuthority(req?.headers?.host);
  if(!parsed)return false;
  if(!expectedPortMatches(parsed,port))return false;
  return hostnamesAllowedForServer(host,env).has(parsed.hostname);
}

export function isAllowedWriteOrigin(req,{host,port,env=process.env}={}){
  const origin=String(req?.headers?.origin||'').trim();
  if(!origin)return true;
  try{
    const parsed=new URL(origin);
    if(parsed.protocol!=='http:'&&parsed.protocol!=='https:')return false;
    if(!expectedPortMatches(parsed,port))return false;
    return hostnamesAllowedForServer(host,env).has(normalizeHostname(parsed.hostname));
  }catch{
    return false;
  }
}

export function securityHeaders(contentType=''){
  const headers={
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
    'cross-origin-opener-policy':'same-origin',
    'cross-origin-resource-policy':'same-origin',
    'origin-agent-cluster':'?1',
    'x-permitted-cross-domain-policies':'none',
    'permissions-policy':[
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'serial=()',
      'hid=()',
      'midi=()',
    ].join(', '),
  };
  if(String(contentType).toLocaleLowerCase('en-US').startsWith('text/html')){
    headers['content-security-policy']=RHYMELAB_HTML_CSP;
  }
  return headers;
}

export function configureHttpServer(server){
  server.requestTimeout=30_000;
  server.headersTimeout=10_000;
  server.keepAliveTimeout=5_000;
  server.maxHeadersCount=64;
  server.maxRequestsPerSocket=100;
  return server;
}

export function requestTargetWithinLimit(value,maxBytes=32*1024){
  return Buffer.byteLength(String(value||''),'utf8')<=maxBytes;
}
