/**
 * flash-cache: Ultra fast JavaScript data cache with near realtime cache expiry ⚡
 *
 * cacheStore Structure:
 *    {
 *      key1: value1,
 *      key2: value2,
 *      ...
 *    }
 */
import mitt from "mitt";
import Events from "./constants/events";
import Expirer from "./expirer";

export default class flashCache {
  /**
   * Cache store
   * */
  cacheStore = {};

  /**
   * Default config
   * */
  defaultConfig = {
    // Default cache expiry time, 60000ms(60s) by default
    // Set `false` to disable expiry(This beats the purpose of cache, the data is store until the instance is disposed)
    // Note: Falsy values like `0` will be treated as `false`
    defaultCacheExpiryIn: 60000,
    // By default, check for cache expiry every 100 ms
    // Reducing this value might create performance issues
    expiryCheckInterval: 100
  };

  constructor(config = {}) {
    // Configuration
    this.config = { ...this.defaultConfig, ...config };

    // Event listeners
    const { on, off, emit } = mitt();
    [this.on, this.off, this.emit] = [on, off, emit];

    // Instance dispose status
    this.instanceDisposed = false;

    // Create cache expirer instance, which maintains its own expiry queue
    const { expiryCheckInterval } = this.config;
    this.cacheExpirer = new Expirer({ expiryCheckInterval });
  }

  checkIfInstanceIsDisposed = () => {
    if (this.instanceDisposed) {
      throw new Error(
        "This instance is already disposed. Please create new instance and try again."
      );
    }
  };

  /**
   * Put data into cache
   *
   * @param {String} key  Cache key
   * @param {String|Object|*} value Value to be stored against cache key
   * @param {Number} expiryIn Expiry time for the key, defaults to defaultCacheExpiryIn
   * */
  put(key = "", value = "", expiryIn = this.config.defaultCacheExpiryIn) {
    this.checkIfInstanceIsDisposed();

    // Remove existing values in the key(if any)
    if (this.cacheStore[key]) {
      this.remove(key);
    }

    const time = Date.now();
    // Ignore all falsy values(like `0` & `false`)
    // Basically if there is no expiry, cache will act as simple in-memory data store
    const expiryAt = expiryIn ? time + expiryIn : null;
    const target = { value, time, expiryAt };
    this.cacheStore[key] = target;

    // If expiry time exists, add to expiry queue
    if (expiryAt) {
      // Remove value from cache and trigger expiry event
      const onExpire = () => {
        this.emit(Events.FC_EXPIRY, {
          key,
          data: target
        });
        this.remove(key, true);
      };

      this.cacheExpirer.add(expiryAt, key, onExpire);
    }
    this.emit(Events.FC_ADD, { key, data: target });

    return target;
  }

  /**
   * Get data from cache
   *
   * @param {String} key  Cache key
   * */
  get(key = "") {
    this.checkIfInstanceIsDisposed();

    const target = this.cacheStore[key];

    if (target) {
      this.emit(Events.FC_GET, { key, data: target });
      return target;
    }

    return null;
  }

  /**
   * Remove data from cache
   *
   * @param {String} key  Cache key to be removed
   * @param {Boolean} shouldEmit  Boolean to indicate the event should be emitted or not
   * */
  remove(key, shouldEmit = false) {
    this.checkIfInstanceIsDisposed();

    const target = this.cacheStore[key];

    if (target) {
      // Remove key & value from cache
      delete this.cacheStore[key];
      const { expiryAt } = target;
      // If timer exists for the key, remove it
      this.cacheExpirer.remove(expiryAt, key);
      if (shouldEmit) {
        this.emit(Events.FC_REMOVE, { key, data: target });
      }
      return true;
    }

    return false;
  }

  /**
   * Cleanup
   *    - Clear entire cache
   *    - Stop expirer
   * */
  dispose() {
    this.checkIfInstanceIsDisposed();

    Object.keys(this.cacheStore).forEach(key => this.remove(key));
    this.emit(Events.FC_CLEAR, {});
    this.cacheExpirer.dispose();
    this.instanceDisposed = true;

    return true;
  }
}
