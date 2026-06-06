export const ADJECTIVES = 'blue bold calm cool crisp dark dawn deep dusk empty fast free fresh gold grand grey happy jolly keen kind late lazy light long loud lush merry mild near neat noble pale pure quiet rapid rare safe sharp silk slim slow soft still swift tall tiny vast warm wild young zesty'.split(' ');
export const NOUNS = 'badger beaver beetle biscuit bobcat branch bridge candle castle cricket crystal dagger eagle falcon feather garden gravel hollow jaguar lantern lizard marble monkey mosaic nebula needle paddle pebble pepper pickle planet pocket puzzle quartz rabbit ribbon saddle salmon scarf shovel sickle slipper spider spiral splash squash squirrel staple stitch thistle turtle violet walnut weasel willow winter wombat wreath zephyr zipper'.split(' ');

export const CHUNK_SIZE = 65536;
export const DB_NAME = 'FileSyncDB';
export const DB_VER = 2;
export const STORE = 'files';

export const state = {
  peer: null,
  conn: null,
  conns: new Map(),
  roomCode: null,
  db: null,
  files: new Map(),
  incoming: {},
  isCreator: false,
  reconnectTimer: null,
  queue: [],
  queueActive: false,
  paused: new Set(),
  resumeState: {},
  searchQuery: '',
  selected: new Set(),
  pinOrder: [],
  peerIds: [],
};
