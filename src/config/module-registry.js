export class ModuleRegistry {
  constructor(kind) {
    if (!kind) throw new TypeError('module kind is required');
    this.kind = kind;
    this.modules = new Map();
  }

  register({ id, version = '0.0.0', create, label = id, description = '', memoryOwnership } = {}) {
    if (!id || typeof create !== 'function') throw new TypeError(`${this.kind} module id and create are required`);
    if (this.modules.has(id)) throw new Error(`${this.kind} module already registered: ${id}`);
    this.modules.set(id, Object.freeze({ id, version, label, description, create, ...(memoryOwnership ? { memoryOwnership } : {}) }));
    return this;
  }

  has(id) { return this.modules.has(id); }

  resolve(id, options = {}) {
    const module = this.modules.get(id);
    if (!module) throw new Error(`Unknown ${this.kind} module: ${id}`);
    const instance = module.create(options);
    if (instance && Object.isExtensible(instance)) Object.defineProperty(instance, 'moduleInfo', { value: { id: module.id, version: module.version }, configurable: true });
    return instance;
  }

  list() {
    return [...this.modules.values()].map(({ create, ...metadata }) => metadata);
  }
}
