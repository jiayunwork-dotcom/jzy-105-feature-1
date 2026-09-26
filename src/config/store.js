'use strict';

/**
 * 探伤配置存取：把常用的 板厚 / 折射角 / 声速 组合起个名字存起来，
 * 供几何核算接口反复调用。纯内存实现，活在进程运行期间，
 * 不跨重启保留。读写均返回副本，调用方改不动库里的数据，
 * 多套配置之间互不干扰。
 */
function createConfigStore() {
  const configs = new Map();

  return {
    /** 保存（或覆盖）一套命名配置，返回存入的副本 */
    save(name, config) {
      const frozen = {
        thickness: config.thickness,
        angleDeg: config.angleDeg,
        velocity: config.velocity,
      };
      configs.set(name, frozen);
      return { ...frozen };
    },

    /** 按名取出配置副本；不存在返回 undefined */
    get(name) {
      const config = configs.get(name);
      return config ? { ...config } : undefined;
    },

    /** 列出全部配置（含名字） */
    list() {
      return [...configs.entries()].map(([name, config]) => ({ name, ...config }));
    },

    /** 删除一套配置，返回是否删到了 */
    remove(name) {
      return configs.delete(name);
    },
  };
}

module.exports = { createConfigStore };
