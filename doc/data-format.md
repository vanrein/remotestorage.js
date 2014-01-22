# Storing up to 4 revisions of each node
Each cache node will represent the versioning state of either one document or one folder. the versioning state is represented by one or more of the `common`, `local`, `remote`, and `push` revisions. Local changes are stored in `local`, and in `push` while an outgoing request is active. Remote changes that have either not been fetched yet, or have not been merged with local changes yet, are stored in `remote`.

# autoMerge
The sync.autoMerge function will try to merge local and remote changes into the common revision of a node. It may call the conflict handler callback provided by the app/module, if there is one. If so, then it will pass this handler a path, and expect either 'local', 'remote', 'fetch', or 'wait' as a reply. Here, 'fetch' is only a valid response in dirty state (state 2) below), and means: fetch the body or itemsMap, and ask me again. 'wait' means leave in conflict state (presumably so the app can consult the user, or merge the two versions and write the result to local), and the app can then call sync.resolve later, with either 'local' or 'remote' as the resolution.

If a conflict is resolved as 'local', this means the 'remote' revision is made common, and the 'local' revision is kept on top of it (state 3) below). If it is resolved as 'remote', then the 'remote' revision is *also* made common, but the difference is then that the 'local' revision is deleted, and a change event is emitted to report this to the app.

When consulting the base client about the current value of a node, you will get either its 'local' revision if it exists, or its 'common' revision otherwise.

//in sync: 
1)  . . . . [common]

//dirty:
2)  . . . . [common]
                \
                 \ . . . . [remote]

//local change:
3)  . . . . [common] . . . . [local]

//conflict:
4) . . . . [common] . . . . [local]
               \
                \ . . . . [remote]

//pushing:
5)  . . . . [common] . . . . [push] . . . . [local]

//pushing, and known dirty (should abort the push, or just wait for the conflict to occur):
6)  . . . . [common] . . . . [push] . . . . [local]
                \
                 \ . . . . [remote]


each of local, push, remote, and common can have,
- for documents:
  * body
  * contentType
  * contentLength
  * revision
  * timestamp
- for folders:
  * itemsMap (itemName -> either true or {ETag: "", "Content-Type": "", "Content-Length": 123})
  * revision
  * timestamp

timestamp means when this data was written (local), push was initiated (push), fetch/push was completed (remote), agreement was reached (common)

# caching strategies

Up to now, our caching strategy was only 'yes', 'no', or 'folders only'. Also, setting a strategy for a subtree of a tree with a different strategy, was ignored. This pull request fixes that by always caching nodes that were seen (even though their caching strategy is 'no'), and introducing a flush() method that flushes the cache for a subtree (which will emit change events that revert any pending outgoing changes there).