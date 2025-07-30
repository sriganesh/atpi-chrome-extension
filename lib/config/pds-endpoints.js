/**
 * Configuration file for AT Protocol PDS endpoints
 * Used for handle resolution and other operations that require PDS interaction
 * 
 * These are fallback endpoints when DNS and well-known resolution fail.
 * Organized by region for optimized routing.
 */

const PDS_ENDPOINTS = {
  // Primary endpoint
  primary: 'https://public.api.bsky.app',
  
  // Regional endpoints for optimized routing
  regions: {
    // US East Region
    usEast: [
      'amanita.us-east.host.bsky.network',
      'blusher.us-east.host.bsky.network',
      'coral.us-east.host.bsky.network',
      'earthstar.us-east.host.bsky.network',
      'elfcup.us-east.host.bsky.network',
      'enoki.us-east.host.bsky.network',
      'helvella.us-east.host.bsky.network',
      'inkcap.us-east.host.bsky.network',
      'lionsmane.us-east.host.bsky.network',
      'lobster.us-east.host.bsky.network',
      'meadow.us-east.host.bsky.network',
      'morel.us-east.host.bsky.network',
      'oyster.us-east.host.bsky.network',
      'panthercap.us-east.host.bsky.network',
      'parasol.us-east.host.bsky.network',
      'porcini.us-east.host.bsky.network',
      'puffball.us-east.host.bsky.network',
      'reishi.us-east.host.bsky.network',
      'scarletina.us-east.host.bsky.network',
      'shiitake.us-east.host.bsky.network',
      'shimeji.us-east.host.bsky.network',
      'splitgill.us-east.host.bsky.network',
      'truffle.us-east.host.bsky.network',
      'velvetfoot.us-east.host.bsky.network'
    ],
    
    // US West Region
    usWest: [
      'agaric.us-west.host.bsky.network',
      'agrocybe.us-west.host.bsky.network',
      'bankera.us-west.host.bsky.network',
      'blewit.us-west.host.bsky.network',
      'boletus.us-west.host.bsky.network',
      'bracket.us-west.host.bsky.network',
      'brittlegill.us-west.host.bsky.network',
      'button.us-west.host.bsky.network',
      'calocybe.us-west.host.bsky.network',
      'chaga.us-west.host.bsky.network',
      'chanterelle.us-west.host.bsky.network',
      'conocybe.us-west.host.bsky.network',
      'cordyceps.us-west.host.bsky.network',
      'cortinarius.us-west.host.bsky.network',
      'cremini.us-west.host.bsky.network',
      'dapperling.us-west.host.bsky.network',
      'entoloma.us-west.host.bsky.network',
      'fibercap.us-west.host.bsky.network',
      'fuzzyfoot.us-west.host.bsky.network',
      'ganoderma.us-west.host.bsky.network',
      'goldenear.us-west.host.bsky.network',
      'gomphidius.us-west.host.bsky.network',
      'gomphus.us-west.host.bsky.network',
      'grisette.us-west.host.bsky.network',
      'hebeloma.us-west.host.bsky.network',
      'hedgehog.us-west.host.bsky.network',
      'hollowfoot.us-west.host.bsky.network',
      'hydnum.us-west.host.bsky.network',
      'hygrophorus.us-west.host.bsky.network',
      'leccinum.us-west.host.bsky.network',
      'lepista.us-west.host.bsky.network',
      'magic.us-west.host.bsky.network',
      'maitake.us-west.host.bsky.network',
      'matsutake.us-west.host.bsky.network',
      'mazegill.us-west.host.bsky.network',
      'milkcap.us-west.host.bsky.network',
      'mottlegill.us-west.host.bsky.network',
      'mycena.us-west.host.bsky.network',
      'oysterling.us-west.host.bsky.network',
      'panus.us-west.host.bsky.network',
      'pholiota.us-west.host.bsky.network',
      'pioppino.us-west.host.bsky.network',
      'poisonpie.us-west.host.bsky.network',
      'polypore.us-west.host.bsky.network',
      'psathyrella.us-west.host.bsky.network',
      'rooter.us-west.host.bsky.network',
      'russula.us-west.host.bsky.network',
      'scalycap.us-west.host.bsky.network',
      'shaggymane.us-west.host.bsky.network',
      'stinkhorn.us-west.host.bsky.network',
      'suillus.us-west.host.bsky.network',
      'verpa.us-west.host.bsky.network',
      'waxcap.us-west.host.bsky.network',
      'witchesbutter.us-west.host.bsky.network',
      'woodear.us-west.host.bsky.network',
      'woodtuft.us-west.host.bsky.network',
      'yellowfoot.us-west.host.bsky.network'
    ]
  },
  
  // Custom PDS endpoints can be added here
  custom: [
    // Add any additional PDS endpoints that aren't part of the standard Bluesky network
  ]
};

// Utility function to get a random server from a region
function getRandomServer(region) {
  const servers = PDS_ENDPOINTS.regions[region];
  if (!servers || servers.length === 0) return null;
  return servers[Math.floor(Math.random() * servers.length)];
}

// Get all servers from all regions
function getAllServers() {
  const allServers = [];
  for (const region in PDS_ENDPOINTS.regions) {
    allServers.push(...PDS_ENDPOINTS.regions[region]);
  }
  return allServers;
}

// Get a random server from all available servers
function getRandomServerFromAll() {
  const allServers = getAllServers();
  if (allServers.length === 0) return null;
  return allServers[Math.floor(Math.random() * allServers.length)];
}

// Export for use in resolvers
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PDS_ENDPOINTS, getRandomServer, getAllServers, getRandomServerFromAll };
} else {
  const global = typeof globalThis !== 'undefined' ? globalThis : self;
  global.PDS_ENDPOINTS = PDS_ENDPOINTS;
  global.getRandomServer = getRandomServer;
  global.getAllServers = getAllServers;
  global.getRandomServerFromAll = getRandomServerFromAll;
}