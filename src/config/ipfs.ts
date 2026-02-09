/**
 * IPFS gateway config for EtherMon.
 * Your content is on Storacha (w3s.link); when that gateway is slow or doesn't load,
 * the app races ALL gateways simultaneously and uses whichever responds first.
 */

/** Known CIDs: metadata (JSON) and images (PNG) — match what's on Storacha / contract baseURI */
export const METADATA_CID = "bafybeickufns5r7i4z6bapg26pjapz4qgg73tidz4orr76s6mz3fakbk5e";
export const IMAGE_CID = "bafybeicmqb7xgljekevci7xnqbotx3kopx5i5fda3z2c5774awvjhuwaiu";

/**
 * Gateways to try. We race ALL of them simultaneously — fastest response wins.
 * Set VITE_IPFS_GATEWAY in .env to add your own preferred gateway at the front.
 */
const GATEWAY_BASES: string[] = [
    "https://gateway.lighthouse.storage",
    ...(typeof import.meta.env !== "undefined" && import.meta.env?.VITE_IPFS_GATEWAY
        ? [import.meta.env.VITE_IPFS_GATEWAY.replace(/\/$/, "")]
        : []),
    "https://dweb.link",
    "https://ipfs.io",
    "https://w3s.link",
];

/** Path-style URL for a CID and optional path */
export function ipfsUrl(cid: string, path = ""): string {
    const base = GATEWAY_BASES[0];
    const p = path ? `/${path}` : "";
    return `${base}/ipfs/${cid}${p}`;
}

/** All gateway URLs for the same content */
export function ipfsUrls(cid: string, path = ""): string[] {
    const p = path ? `/${path}` : "";
    return GATEWAY_BASES.map((base) => `${base}/ipfs/${cid}${p}`);
}

/** Direct image URL for a pokemonId using IMAGE_CID */
export function imageUrl(pokemonId: number): string {
    return ipfsUrl(IMAGE_CID, `${pokemonId}.png`);
}

/** All gateway image URLs for a pokemonId (for <img> onError fallback) */
export function imageUrls(pokemonId: number): string[] {
    return ipfsUrls(IMAGE_CID, `${pokemonId}.png`);
}

/** Direct metadata JSON URL for a pokemonId using METADATA_CID */
export function metadataUrl(pokemonId: number): string {
    return ipfsUrl(METADATA_CID, `${pokemonId}.json`);
}

/**
 * Rewrite any IPFS or gateway URL to use our preferred gateway.
 */
export function toPreferredGateway(url: string): string {
    if (!url || typeof url !== "string") return url;
    const trimmed = url.trim();

    // ipfs://CID/path
    const ipfsProto = trimmed.match(/^ipfs:\/\/([^/]+)\/?(.*)$/);
    if (ipfsProto) {
        const [, cid, path] = ipfsProto;
        return ipfsUrl(cid, path || "");
    }

    // Subdomain style: https://CID.ipfs.somegateway.com/path
    const subdomain = trimmed.match(/^https?:\/\/([a-zA-Z0-9]+)\.ipfs\.[^/]+\/?(.*)$/);
    if (subdomain) {
        const [, cid, path] = subdomain;
        return ipfsUrl(cid, path || "");
    }

    // Path style: https://somegateway.com/ipfs/CID/path
    const pathStyle = trimmed.match(/^https?:\/\/[^/]+\/ipfs\/([^/]+)\/?(.*)$/);
    if (pathStyle) {
        const [, cid, path] = pathStyle;
        return ipfsUrl(cid, path || "");
    }

    return url;
}

/** Extract CID and path from any IPFS-style URL */
function parseCidPath(url: string): { cid: string; path: string } | null {
    // Path style: /ipfs/CID/path
    const pathMatch = url.match(/\/ipfs\/([^/]+)\/?(.*)$/);
    if (pathMatch) return { cid: pathMatch[1], path: pathMatch[2] || "" };

    // Subdomain style
    const subMatch = url.match(/^https?:\/\/([a-zA-Z0-9]+)\.ipfs\.[^/]+\/?(.*)$/);
    if (subMatch) return { cid: subMatch[1], path: subMatch[2] || "" };

    return null;
}

function fetchWithTimeout(url: string, ms: number): Promise<Response> {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    return fetch(url, { signal: c.signal }).finally(() => clearTimeout(t));
}

/**
 * Race ALL gateways simultaneously — first successful response wins.
 * Much faster than trying sequentially when gateways are slow.
 */
export async function fetchFromIpfs(urlOrCidPath: string): Promise<Response> {
    const url = urlOrCidPath.startsWith("http") ? urlOrCidPath : urlOrCidPath;

    // Parse CID + path so we can build URLs for all gateways
    const parsed = parseCidPath(url);

    if (parsed) {
        const { cid, path } = parsed;
        const p = path ? `/${path}` : "";
        const urls = GATEWAY_BASES.map((base) => `${base}/ipfs/${cid}${p}`);

        // Race all gateways — first OK response wins
        return raceOkFetch(urls, 12000);
    }

    // Fallback: just fetch the URL directly
    return fetchWithTimeout(url, 12000);
}

/**
 * Race multiple URLs. Returns the first Response that is ok (status 200-299).
 * All other in-flight requests are aborted once we have a winner.
 */
async function raceOkFetch(urls: string[], timeoutMs: number): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
        const controllers = urls.map(() => new AbortController());
        let settled = false;
        let failCount = 0;

        const cleanup = () => {
            controllers.forEach((c) => { try { c.abort(); } catch {} });
        };

        // Global timeout
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                cleanup();
                reject(new Error("All IPFS gateways timed out"));
            }
        }, timeoutMs);

        urls.forEach((url, i) => {
            fetch(url, { signal: controllers[i].signal })
                .then((res) => {
                    if (settled) return;
                    if (res.ok) {
                        settled = true;
                        clearTimeout(timer);
                        cleanup();
                        resolve(res);
                    } else {
                        throw new Error(`HTTP ${res.status}`);
                    }
                })
                .catch(() => {
                    failCount++;
                    if (failCount === urls.length && !settled) {
                        settled = true;
                        clearTimeout(timer);
                        reject(new Error(`All IPFS gateways failed for: ${urls[0]}`));
                    }
                });
        });
    });
}
