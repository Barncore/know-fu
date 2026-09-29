import {fixture} from '../test/helpers.js';
import {atomic,json} from '../src/core.js';
const f=await fixture('kill-recovery');await atomic(process.argv[2],json({root:f.store.root,project:f.store.project,ledger:f.store.ledgerRoot}));await f.store.publish(f.records,f.bodies,null,'Interrupted worker fixture',f.scope);
