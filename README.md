# ATPI Chrome Extension

A simple Chrome extension that resolves AT Protocol URLs to JSON data with hover preview.

## Features

- **Automatic URL Detection**: Finds all `at://` URLs on any webpage
- **Click to Open**: Converts URLs to clickable links that open in atproto.at
- **Hover Preview**: Shows JSON data when hovering over AT Protocol URLs
- **Dual Resolution Modes**:
  - **Local Mode**: Direct PDS server connection (faster, no external dependencies)
  - **Remote Mode**: Uses atpi.at service
- **Memory Efficient**: Lazy loading, simple caching, minimal DOM manipulation

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select the `atpi-chrome-extension-new` directory

## Usage

1. Visit any webpage containing AT Protocol URLs (e.g., `at://did:plc:7gm5ejhut7kia2kzglqfew5b/app.bsky.feed.post/3lqgrasjofs2u`)
2. The extension will automatically:
   - Convert AT URLs to clickable links
   - Show JSON data when you hover over them
   - Provide links to open in atproto.at or atpi.at

3. Click the extension icon to:
   - Switch between Local and Remote modes
   - Clear the cache

## How It Works

- **Local Mode**: Connects directly to PDS servers by resolving handles and DIDs
- **Remote Mode**: Uses the atpi.at service to resolve URLs
- **Caching**: 5-minute cache for resolved URLs to improve performance

## Development

The extension consists of:
- `manifest.json` - Chrome extension manifest (v3)
- `content/` - Content scripts for URL detection and overlay
- `background/` - Service worker for URL resolution
- `popup/` - Extension popup for settings
- `lib/` - AT Protocol resolver adapted for browser

## Memory Optimization

- Only resolves URLs when hovered (lazy loading)
- Creates/destroys overlay on demand
- Simple 5-minute cache with automatic cleanup
- No external UI frameworks (vanilla JS only)

## Privacy

- The extension only processes AT Protocol URLs
- In Local mode, it connects directly to PDS servers
- In Remote mode, URLs are sent to atpi.at for resolution
- No tracking or analytics

## License

MIT