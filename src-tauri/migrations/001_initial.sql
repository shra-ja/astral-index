-- Unreleased baseline: incompatible development databases must be recreated.
CREATE TABLE metadata (
    singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
    database_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision >= 0)
) STRICT;
INSERT INTO metadata VALUES (1, lower(hex(randomblob(16))), 0);
CREATE TABLE accounts (
    game TEXT NOT NULL,
    uid TEXT NOT NULL,
    server TEXT NOT NULL,
    timezone INTEGER,
    PRIMARY KEY(game, uid, server)
) STRICT;
CREATE TABLE batches (
    id INTEGER PRIMARY KEY,
    game TEXT NOT NULL,
    uid TEXT NOT NULL,
    server TEXT NOT NULL,
    adapter TEXT NOT NULL,
    imported_at INTEGER NOT NULL,
    inserted INTEGER NOT NULL CHECK(inserted>=0),
    duplicates INTEGER NOT NULL CHECK(duplicates>=0),
    conflicts INTEGER NOT NULL CHECK(conflicts=0),
    UNIQUE(id,game,uid,server),
    FOREIGN KEY(game,uid,server) REFERENCES accounts(game,uid,server)
) STRICT;
CREATE TABLE rolls (
    game TEXT NOT NULL,
    uid TEXT NOT NULL,
    server TEXT NOT NULL,
    id TEXT NOT NULL,
    payload TEXT NOT NULL CHECK(json_valid(payload)),
    first_batch INTEGER NOT NULL,
    PRIMARY KEY(game,uid,server,id),
    FOREIGN KEY(game,uid,server) REFERENCES accounts(game,uid,server),
    FOREIGN KEY(first_batch,game,uid,server) REFERENCES batches(id,game,uid,server)
) STRICT;
PRAGMA application_id = 1381257795;
PRAGMA user_version = 2;
