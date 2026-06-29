// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const path = require('path');
const { FileStore } = require('metro-cache');
const exclusionList = require(path.join(__dirname, 'node_modules/metro-config/src/defaults/exclusionList.js')).default;

const config = getDefaultConfig(__dirname);

// Use a stable on-disk store (shared across web/android)
const root = process.env.METRO_CACHE_ROOT || path.join(__dirname, '.metro-cache');
config.cacheStores = [
  new FileStore({ root: path.join(root, 'cache') }),
];

const escapedProjectRoot = __dirname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const projectFolder = (folder) => new RegExp(`${escapedProjectRoot}\\/${folder}\\/.*`);

config.resolver.blockList = exclusionList([
  projectFolder('\\.metro-cache'),
  projectFolder('dist-preview'),
  projectFolder('web-build'),
  projectFolder('coverage'),
  projectFolder('android'),
  projectFolder('ios'),
  projectFolder('build'),
  projectFolder('dist'),
]);


// // Exclude unnecessary directories from file watching
// config.watchFolders = [__dirname];
// config.resolver.blacklistRE = /(.*)\/(__tests__|android|ios|build|dist|.git|node_modules\/.*\/android|node_modules\/.*\/ios|node_modules\/.*\/windows|node_modules\/.*\/macos)(\/.*)?$/;

// // Alternative: use a more aggressive exclusion pattern
// config.resolver.blacklistRE = /node_modules\/.*\/(android|ios|windows|macos|__tests__|\.git|.*\.android\.js|.*\.ios\.js)$/;

// Reduce the number of workers to decrease resource usage
config.maxWorkers = 2;

module.exports = config;
