define(function(require, exports, module) {
  exports.sync = (function() {
    var backend;
    
    function setBackend(backendToSet) {
      backend = backendToSet;
    }
    function start() {
      localStorage.setItem('_shadowSyncStatus', 'pulling');
      console.log('setting sync status to pulling');
    }
    function push() {
      if(localStorage.getItem('_shadowSyncStatus') == 'pulling') {
        console.log('will push after pulling is completed');
      } else {
        localStorage.setItem('_shadowSyncStatus', 'pushing');
        console.log('setting sync status to pushing');
      }
    }
    function getItemToPull(next) {
      var itemToPull = localStorage.getItem('_shadowSyncCurrEntry');
      if(next) {
        if(itemToPull == null) {
          itemToPull = -1;
        }
        var shadowRemote =JSON.parse(localStorage.getItem('_shadowRemote'));
        var shadowIndex =JSON.parse(localStorage.getItem('_shadowIndex'));
        var keysArr = keys(shadowRemote);
        while(true) {
          itemToPull += 1;
          var thisKey = keysArr[itemToPull];
          if(shadowRemote[thisKey] > localStorage[thisKey]) {
             localStorage.setItem('_shadowSyncCurrEntry', itemToPull);
             return thisKey;
          }
          //if(itemToPull >= keysArr.length) { - this gets into an infinite loop with polluted array prototype
          if(typeof(keysArr[itemToPull]) == "undefined") {
            return false;
          }
        }
      }
      if(itemToPull == null) {
          return '_shadowIndex';
      } else {
        return (keys(JSON.parse(localStorage.getItem('_shadowRemote'))))[itemToPull];
      }
    }
    function updateLocalIndex(itemPulled) {
      var remote = JSON.parse(localStorage.getItem('_shadowRemote'));
      var local = JSON.parse(localStorage.getItem('_shadowIndex'));
      if(!local) {
        local = {};
      }
      local[itemPulled] = remote[itemPulled];
      localStorage.setItem('_shadowItem', JSON.stringify(local));
    }
    function resumePulling(deadLine, cb, whenDone) {
      console.log('resume pulling');
      var itemToPull = getItemToPull(false);
      if(!itemToPull) {
        localStorage.setItem('_shadowSyncStatus', 'idle');
      } else {
        var remoteKeyName = itemToPull;
        if(itemToPull != '_shadowIndex') {
          remoteKeyName += '_'+JSON.parse(localStorage.getItem('_shadowRemote'))[itemToPull];
        }
        backend.get(remoteKeyName, function(msg) {
          console.log('error retrieving "'+remoteKeyName+'":'+msg);
          if((remoteKeyName == '_shadowIndex') && (msg==404)) {
            console.log('virgin remote');
            localStorage.setItem('_shadowRemote', JSON.stringify({}));
            localStorage.setItem('_shadowSyncStatus', 'pushing');
          }
          whenDone();
        }, function(value) {
          if(itemToPull == '_shadowIndex') {
            localStorage.setItem('_shadowRemote', value);
          } else {
             updateLocalIndex(itemToPull);
             cb(itemToPull, value);
          }
          var nextItem = getItemToPull(true);
          if(nextItem) {
            work(deadLine, cb, whenDone);
          } else {
            localStorage.setItem('_shadowSyncStatus', 'pushing');
            whenDone();
          }
        }, deadLine);
      }
    }
    //FIXME
    function keys(obj) {
      var keysArr = [];
      for(var i in obj) {
        keysArr.push(i);
      }
      return keysArr;
    }

    function getItemToPush(next) {
      var local = JSON.parse(localStorage.getItem('_shadowIndex'));
      var remote = JSON.parse(localStorage.getItem('_shadowRemote'));
      var entryToPush = localStorage.getItem('_shadowSyncCurrEntry');
      if(entryToPush == null) {
        entryToPush = 0;//leave as null in localStorage, no use updating that
      }
      if(next) {
        entryToPush++;
        localStorage.setItem('_shadowSyncCurrEntry', entryToPush);
      }
      var localKeys = keys(local);
      var remoteKeys = keys(remote);
      var keysArr = [];
      for(var i = 0; i < localKeys.length; i++) {
        if((!remote[remoteKeys[i]]) || (local[localKeys[i]] > remote[remoteKeys[i]])) {
          keysArr.push(localKeys[i]);
        }
      }
      if(entryToPush < keysArr.length) {
        return keysArr[entryToPush];
      } else if(entryToPush == keysArr.length) {
        return '_shadowIndex';
      } else {
        localStorage.removeItem('_shadowSyncCurrEntry');
        return false;
      }
    }

    function resumePushing(deadLine, whenDone) {
      console.log('resume pushing');
      var itemToPush = getItemToPush(false);
      var remoteKeyName = itemToPush;
      if(itemToPush != '_shadowIndex') {
        remoteKeyName += '_'+JSON.parse(localStorage.getItem('_shadowIndex'))[itemToPush];
      }
      backend.set(remoteKeyName, localStorage.getItem(itemToPush), function(msg) {
        console.log('error putting '+itemToPush);
        whenDone();
      }, function() {
        if(itemToPush == '_shadowIndex') {
          //pushing was successful; prime cache:
          localStorage.setItem('_shadowRemote', localStorage.getItem('_shadowIndex'));
        }
        if(getItemToPush(true)) {
          work(deadLine, function() {
            console.log('incoming changes should not happen when pushing!');
          }, whenDone);
        } else {
          localStorage.setItem('_shadowSyncStatus', 'idle');
          whenDone();
        }
      }, deadLine);
    }
    function compareIndices() {
      var remote = JSON.parse(localStorage.getItem('_shadowRemote'));
      var local = JSON.parse(localStorage.getItem('_shadowIndex'));
      if(remote.length != local.length) {
        return false;
      }
      for(var i = 0; i<remote.length; i++) {
        if(remote[i] != local[i]) {
          return false;
        }
      }
      return true;
    }
    function work(deadLine, cbIncomingChange, whenDone) {
      var now = (new Date().getTime());
      if(deadLine < now) {
        return;
      }
      console.log('sync working, '+(deadLine - now)+' milliseconds left:');
      if(localStorage.getItem('_shadowSyncStatus') == 'pulling') {
        resumePulling(deadLine, cbIncomingChange, whenDone);
      } else if(localStorage.getItem('_shadowSyncStatus') == 'pushing') {
        resumePushing(deadLine, whenDone);
      } else {
        if(compareIndices()) {//this is necessary for instance if operating state was lost with a page refresh, bug, or network problem
          console.log('nothing to work on.');
        } else {
          console.log('found differences between the indexes. bug?');
        }
        whenDone();
      }
    }
    return {
      setBackend: setBackend,
      start: start,
      push: push,
      work: work
    };
  })();
});