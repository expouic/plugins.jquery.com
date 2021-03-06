var mysql = require( "mysql" ),
	config = require( "./config" );

var db,
	postsTable = "wp_" + (config.siteId ? config.siteId + "_" : "") + "posts";
	postmetaTable = "wp_" + (config.siteId ? config.siteId + "_" : "") + "postmeta";



function connect() {
	db = new mysql.createClient({
		host: config.dbHost,
		port: config.dbPort,
		user: config.dbUser,
		password: config.dbPassword,
		database: config.dbName
	});
}

function getPostId( name, fn ) {
	db.query( "SELECT `ID` FROM `" + postsTable + "` WHERE `post_name` = ?",
		[ name ], function( error, rows ) {
			if ( error ) {
				return fn( error );
			}

			if ( !rows.length ) {
				return fn( null, null );
			}

			fn( null, rows[ 0 ].ID );
		});
}

function createOrUpdatePost( name, title, content, fn ) {
	getPostId( name, function( error, id ) {
			if ( error ) {
				return fn( error );
			}

			if ( !id ) {
				// TODO: set post_type = "page"
				db.query( "INSERT INTO `" + postsTable + "` " +
					"SET `post_name` = ?, `post_title` = ?, `post_content` = ?",
					[ name, title, content ], fn );
			} else {
				db.query( "UPDATE `" + postsTable + "` " +
					"SET `post_content` = ? " +
					"WHERE `ID` = ?",
					[ content, id ], fn );
			}
		});
}

function setMeta( plugin, key, value, fn ) {
	getPostId( plugin, function( error, id ) {
		if ( error ) {
			return fn( error );
		}

		if ( !id ) {
			return fn( new Error( "Cannot set " + key + " for " + plugin + "." ) );
		}

		db.query( "SELECT `meta_id` FROM `" + postmetaTable + "` " +
			"WHERE `post_id` = ? AND `meta_key` = ?",
			[ id, key ], function( error, rows ) {
				if ( error ) {
					return fn( error );
				}

				if ( !rows.length ) {
					db.query( "INSERT INTO `" + postmetaTable + "` " +
						"SET `post_id` = ?, `meta_key` = ?, `meta_value` = ?",
						[ id, key, value ], function( error ) {
							if ( error ) {
								return fn( error );
							}

							fn( null );
						});
				} else {
					db.query( "UPDATE `" + postmetaTable + "` " +
						"SET `meta_value` = ? WHERE `meta_id` = ?",
						[ value, rows[ 0 ].meta_id ], function( error ) {
							if ( error ) {
								return fn( error );
							}

							fn( null );
						});
				}
			});
	});
}

function getMeta( plugin, key, fn ) {
	getPostId( plugin, function( error, id ) {
		if ( error ) {
			return fn( error );
		}

		if ( !id ) {
			return fn( null, null );
		}

		db.query( "SELECT `meta_value` FROM `" + postmetaTable + "` " +
			"WHERE `post_id` = ? AND `meta_key` = ?",
			[ id, key ], function( error, rows ) {
				if ( error ) {
					return fn( error );
				}

				if ( !rows.length ) {
					return fn( null, null );
				}

				fn( null, rows[ 0 ].meta_value );
			});
	});
}

function auto( fn ) {
	return function() {
		if ( !db ) {
			connect();
		}
		fn.apply( this, arguments );
	};
}



module.exports = {
	addVersionedPlugin: auto(function( version, package, content, fn ) {
		var postName = package.name + "-" + package.version;
		createOrUpdatePost( postName, package.title, content, function( error ) {
			if ( error ) {
				return fn( error );
			}

			setMeta( postName, "package_json", JSON.stringify( package ), fn );
		});
	}),

	getVersions: auto(function( plugin, fn ) {
		getMeta( plugin, "versions", function( error, versions ) {
			if ( error ) {
				return fn( error );
			}

			if ( !versions ) {
				return fn( null, [] );
			}

			return fn( null, JSON.parse( versions ) );
		});
	}),

	setVersions: auto(function( plugin, versions, latest, fn ) {
		var postName = plugin + "-" + latest;
		db.query( "SELECT `post_title`, `post_content` FROM `" + postsTable + "` WHERE `post_name` = ?",
			[ postName ], function( error, rows ) {
				if ( error ) {
					return fn( error );
				}

				if ( !rows.length ) {
					return fn( new Error( "No post for " + postName ) );
				}

				createOrUpdatePost( plugin, rows[ 0 ].post_title, rows[ 0 ].post_content, function( error ) {
					if ( error ) {
						return fn( error );
					}

					setMeta( plugin, "versions", JSON.stringify( versions ), fn );
				});
		});
	}),

	end: function() {
		if ( db ) {
			db.end();
			db = null;
		}
	}
};
