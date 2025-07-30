# AT Protocol Handle Resolution Guide

This document describes a decentralized approach to resolving AT Protocol handles without relying on specific service providers like Bluesky.

## Overview

AT Protocol handle resolution is a two-step process:
1. **Handle → DID**: Convert a handle (e.g., `alice.bsky.social`) to a DID (e.g., `did:plc:abc123`)
2. **DID → PDS**: Find the Personal Data Server (PDS) hosting the DID's data

## Resolution Methods (In Order)

### 1. DNS Resolution (Most Decentralized)

Query DNS TXT records for `_atproto.{handle}` to find the DID.

**Implementation:**
```javascript
// Using DNS-over-HTTPS (DoH) for browser compatibility
const dohProviders = [
  'https://dns.google/resolve',
  'https://cloudflare-dns.com/dns-query'
];

async function resolveDNS(handle) {
  const url = `${dohProvider}?name=_atproto.${handle}&type=TXT`;
  const response = await fetch(url, {
    headers: { 'Accept': 'application/dns-json' }
  });
  const data = await response.json();
  
  // Look for TXT record starting with "did="
  const answer = data.Answer?.find(a => a.data.startsWith('"did='));
  if (answer) {
    return answer.data.slice(5, -1); // Remove "did=" prefix and quotes
  }
}
```

**Example DNS Record:**
```
_atproto.alice.example.com IN TXT "did=did:plc:abc123xyz"
```

### 2. Well-Known HTTP Resolution

Fetch from `https://{handle}/.well-known/atproto-did`

**Implementation:**
```javascript
async function resolveWellKnown(handle) {
  const response = await fetch(`https://${handle}/.well-known/atproto-did`, {
    redirect: 'manual' // Don't follow redirects
  });
  
  if (response.ok) {
    const text = await response.text();
    return text.trim();
  }
}
```

**Example Response:**
```
did:plc:abc123xyz
```

### 3. XRPC Resolution (Fallback)

As a last resort, query known AT Protocol services.

**Implementation:**
```javascript
async function resolveXRPC(handle, serviceUrl) {
  const response = await fetch(
    `${serviceUrl}/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`
  );
  
  if (response.ok) {
    const data = await response.json();
    return data.did;
  }
}
```

## DID Resolution

Once you have a DID, resolve it to find the PDS:

### For `did:plc:*`
Query the PLC Directory:
```javascript
const response = await fetch(`https://plc.directory/${did}`);
const data = await response.json();
const service = data.service?.find(s => s.type === 'AtprotoPersonalDataServer');
const pdsUrl = service?.serviceEndpoint;
```

### For `did:web:*`
Extract from the DID itself:
```javascript
// did:web:example.com → https://example.com
const domain = did.substring(8).replace(/:/g, '/');
const pdsUrl = `https://${domain}`;
```

## Complete Resolution Flow

```javascript
async function resolveHandle(handle) {
  let did;
  
  // Try DNS first
  try {
    did = await resolveDNS(handle);
    if (did) return { did, method: 'dns' };
  } catch (e) {}
  
  // Try well-known
  try {
    did = await resolveWellKnown(handle);
    if (did) return { did, method: 'wellknown' };
  } catch (e) {}
  
  // Try XRPC as last resort
  try {
    did = await resolveXRPC(handle, 'https://public.api.bsky.app');
    if (did) return { did, method: 'xrpc' };
  } catch (e) {}
  
  throw new Error('Failed to resolve handle');
}
```

## XRPC Fallback Strategy

For XRPC fallback, randomly try servers from the available pool:

```javascript
const servers = [
  'morel.us-east.host.bsky.network',
  'maitake.us-west.host.bsky.network',
  // ... more servers
];

async function resolveWithXRPCFallback(handle) {
  // Try primary endpoint first
  try {
    return await resolveXRPC(handle, 'https://public.api.bsky.app');
  } catch (e) {}
  
  // Try random servers from the pool
  const shuffled = [...servers].sort(() => Math.random() - 0.5);
  const attempts = Math.min(5, shuffled.length);
  
  for (let i = 0; i < attempts; i++) {
    try {
      return await resolveXRPC(handle, `https://${shuffled[i]}`);
    } catch (e) {}
  }
  
  throw new Error('All XRPC servers failed');
}
```

## Best Practices

1. **Cache Results**: Cache handle→DID and DID→PDS mappings (5-15 minute TTL)
2. **Parallel Queries**: For DNS, query multiple DoH providers simultaneously
3. **Timeout Handling**: Set reasonable timeouts (3-5 seconds per method)
4. **Error Recovery**: Continue to next method on failure
5. **User Privacy**: DNS queries only reveal handle lookups, not actual data access

## Security Considerations

1. **Verify DIDs**: Ensure resolved DIDs match expected format
2. **HTTPS Only**: Always use HTTPS for well-known and XRPC
3. **No Redirects**: Don't follow redirects on well-known requests
4. **Validate Responses**: Check response formats before parsing

## Testing

Test handles for each resolution method:
- DNS: Any handle with `_atproto` TXT record
- Well-known: Any handle with `/.well-known/atproto-did`
- XRPC: Most Bluesky handles (e.g., `user.bsky.social`)

## Implementation Checklist

- [ ] DNS resolver with DoH support
- [ ] Well-known HTTP resolver
- [ ] XRPC resolver with regional fallback
- [ ] DID document resolver (PLC + Web)
- [ ] Caching layer
- [ ] Error handling and fallback logic
- [ ] Timeout management
- [ ] Resolution method reporting