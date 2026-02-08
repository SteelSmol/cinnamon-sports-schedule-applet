const { Soup, GLib, Gio } = imports.gi;

const APPLET_UUID = 'sports-schedule-applet@steel';

const DEFAULT_TIMEOUT = 30;
const MAX_CONCURRENT_REQUESTS = 3;
const MAX_RETRIES = 3;
const USER_AGENT = "Sports-Schedule-Applet/2.0";

class ApiClient {
    constructor() {
        this._httpSession = null;
        this._activeRequests = 0;
        this._requestQueue = [];
        this._cacheDir = null;
        this._isDestroyed = false;
        this._inFlightRequests = new Map();
    }

    _getCacheDir() {
        if (!this._cacheDir) {
            const appletDir = imports.ui.appletManager.appletMeta[APPLET_UUID].path;
            this._cacheDir = GLib.build_filenamev([appletDir, 'cache']);

            const dir = Gio.File.new_for_path(this._cacheDir);
            if (!dir.query_exists(null)) {
                try {
                    dir.make_directory_with_parents(null);
                    global.log(`[Sports-Applet/ApiClient] Created cache directory: ${this._cacheDir}`);
                } catch (e) {
                    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
                        global.logError(`[Sports-Applet/ApiClient] Cache dir error: ${e}`);
                    }
                }
            }
        }
        return this._cacheDir;
    }

    _getHttpSession() {
        if (!this._httpSession) {
            const cacheDir = this._getCacheDir();
            const soupCache = new Soup.Cache({
                'cache-dir': cacheDir,
                'cache-type': Soup.CacheType.SINGLE_USER
            });

            this._httpSession = new Soup.Session({
                user_agent: USER_AGENT,
                timeout: DEFAULT_TIMEOUT
            });
            this._httpSession.add_feature(soupCache);
        }
        return this._httpSession;
    }

    async _executeWithQueue(fn) {
        if (this._activeRequests >= MAX_CONCURRENT_REQUESTS) {
            await new Promise(resolve => this._requestQueue.push(resolve));
        }

        this._activeRequests++;
        try {
            return await fn();
        } finally {
            this._activeRequests--;
            if (this._requestQueue.length > 0) {
                const next = this._requestQueue.shift();
                next();
            }
        }
    }

    async fetchJson(url, retryCount = 0) {
        if (this._isDestroyed) {
            throw new Error('ApiClient has been destroyed');
        }

        // Dedup: if same URL is already in-flight, return its promise
        if (retryCount === 0 && this._inFlightRequests.has(url)) {
            global.log(`[ApiClient] Dedup: reusing in-flight request for ${url.substring(0, 80)}...`);
            return this._inFlightRequests.get(url);
        }

        const promise = this._doFetchJson(url, retryCount);
        if (retryCount === 0) {
            this._inFlightRequests.set(url, promise);
            promise.finally(() => this._inFlightRequests.delete(url));
        }
        return promise;
    }

    async _doFetchJson(url, retryCount = 0) {
        global.log(`[ApiClient] fetchJson: ${url.substring(0, 80)}...`);
        return this._executeWithQueue(async () => {
            const session = this._getHttpSession();
            global.log(`[ApiClient] HTTP session ready, sending request`);

            try {
                const { message, bytes } = await new Promise((resolve, reject) => {
                    const requestMessage = Soup.Message.new('GET', url);

                    try {
                        requestMessage.request_headers.append('Accept', 'application/json');
                    } catch (e) {
                        // ignore header errors
                    }

                    const cancellable = new Gio.Cancellable();
                    const timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, DEFAULT_TIMEOUT, () => {
                        global.log(`[ApiClient] Request timeout after ${DEFAULT_TIMEOUT}s`);
                        cancellable.cancel();
                        return GLib.SOURCE_REMOVE;
                    });

                    global.log(`[ApiClient] Sending async request...`);
                    session.send_and_read_async(requestMessage, GLib.PRIORITY_DEFAULT, cancellable, (session, result) => {
                        global.log(`[ApiClient] Response received`);
                        GLib.Source.remove(timeoutId);

                        try {
                            if (cancellable.is_cancelled()) {
                                reject(new Error("Request timeout"));
                                return;
                            }

                            const responseBytes = session.send_and_read_finish(result);
                            resolve({ message: requestMessage, bytes: responseBytes });
                        } catch (e) {
                            global.logError(`[ApiClient] Response processing error: ${e}`);
                            reject(e);
                        }
                    });
                });

                const statusCode = message.get_status();
                global.log(`[ApiClient] Response status: ${statusCode}`);

                if (statusCode === 429 && retryCount < MAX_RETRIES) {
                    global.log(`[ApiClient] Rate limited, retrying...`);
                    const delay = Math.pow(2, retryCount) * 1000;
                    await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                        resolve();
                        return GLib.SOURCE_REMOVE;
                    }));
                    return this.fetchJson(url, retryCount + 1);
                }

                if (statusCode !== 200) {
                    throw new Error(`HTTP ${statusCode}`);
                }

                const data = bytes.get_data();
                if (!data) {
                    throw new Error("Empty response");
                }

                global.log(`[ApiClient] Parsing JSON response...`);
                const text = imports.byteArray.toString(data);
                const json = JSON.parse(text);
                global.log(`[ApiClient] JSON parsed successfully`);
                return json;

            } catch (e) {
                global.logError(`[ApiClient] Fetch error: ${e}`);
                if (retryCount < MAX_RETRIES) {
                    const delay = 1000 * (retryCount + 1);
                    await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                        resolve();
                        return GLib.SOURCE_REMOVE;
                    }));
                    return this.fetchJson(url, retryCount + 1);
                }
                throw e;
            }
        });
    }

    async downloadFile(url, destPath) {
        return this._executeWithQueue(async () => {
            const session = this._getHttpSession();

            return new Promise((resolve, reject) => {
                const requestMessage = Soup.Message.new('GET', url);
                const cancellable = new Gio.Cancellable();

                const timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, DEFAULT_TIMEOUT, () => {
                    cancellable.cancel();
                    return GLib.SOURCE_REMOVE;
                });

                session.send_and_read_async(requestMessage, GLib.PRIORITY_DEFAULT, cancellable, (session, result) => {
                    GLib.Source.remove(timeoutId);

                    try {
                        if (cancellable.is_cancelled()) {
                            reject(new Error("Request timeout"));
                            return;
                        }

                        const responseBytes = session.send_and_read_finish(result);
                        const statusCode = requestMessage.get_status();

                        if (statusCode !== 200) {
                            reject(new Error(`HTTP ${statusCode}`));
                            return;
                        }

                        const file = Gio.File.new_for_path(destPath);
                        const tmpFile = Gio.File.new_for_path(destPath + '.tmp');

                        const stream = tmpFile.replace(null, false, Gio.FileCreateFlags.NONE, null);
                        const data = responseBytes.get_data();
                        stream.write_bytes(data, null);
                        stream.close(null);
                        tmpFile.move(file, Gio.FileCopyFlags.OVERWRITE, null, null);

                        resolve(destPath);
                    } catch (e) {
                        reject(e);
                    }
                });
            });
        });
    }

    cleanup() {
        this._isDestroyed = true;
        this._inFlightRequests.clear();

        // Unblock queued promises so they can hit the _isDestroyed check
        for (const resolve of this._requestQueue) {
            resolve();
        }

        if (this._httpSession) {
            this._httpSession.abort();
            this._httpSession = null;
        }
        this._activeRequests = 0;
        this._requestQueue = [];
    }
}

var EXPORTS = { ApiClient };
