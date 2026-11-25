//! A UIGF export of saved Star Rail accounts: the file the writer makes of their
//! histories, checked against UIGF's schema, or why there is nothing to export
//! ([decision 0035](../../docs/architecture/decisions/0035-runtime-export-validation.md)).
//! No file, database or network access: the histories are passed in.

use crate::storage::AccountHistory;
use crate::uigf::{self, Exported};

/// An export's file, and what it did with each account.
#[derive(PartialEq, Eq)]
pub struct Export {
    /// The UIGF file. Holds player data: never log or display it.
    pub bytes: Vec<u8>,
    pub accounts: Vec<ExportedAccount>,
}
impl std::fmt::Debug for Export {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Export")
            .field("bytes", &"[redacted]")
            .field("accounts", &self.accounts)
            .finish()
    }
}

/// What an export did with one saved account. Holds a player identifier: never log it.
#[derive(Debug, PartialEq, Eq)]
pub struct ExportedAccount {
    pub uid: String,
    pub server: String,
    pub outcome: Exported,
}

/// Why nothing is exported.
#[derive(Debug, PartialEq, Eq)]
pub enum Refusal {
    /// No account has a roll to write; each one given says why.
    NothingToExport(Vec<ExportedAccount>),
    /// UIGF's schema refuses the document, which the writer should never make.
    Invalid,
}

/// Export `histories` from Astral Index `app_version` at `exported_at`, in seconds
/// since the Unix epoch, checking the document against `schema` before it becomes
/// a file.
pub fn build(
    histories: &[AccountHistory],
    app_version: &str,
    exported_at: i64,
    schema: &jsonschema::Validator,
) -> Result<Export, Refusal> {
    let saved: Vec<_> = histories
        .iter()
        .map(|history| uigf::Saved {
            uid: &history.uid,
            timezone: history.timezone,
            rolls: &history.rolls,
        })
        .collect();
    let export = uigf::write(&saved, app_version, exported_at);
    let written = export.has_rolls();
    let accounts = histories
        .iter()
        .zip(export.accounts)
        .map(|(history, outcome)| ExportedAccount {
            uid: history.uid.clone(),
            server: history.server.clone(),
            outcome,
        })
        .collect();
    if !written {
        return Err(Refusal::NothingToExport(accounts));
    }
    if !schema.is_valid(&export.document) {
        return Err(Refusal::Invalid);
    }
    Ok(Export {
        bytes: serde_json::to_vec(&export.document).expect("a document is JSON"),
        accounts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hsr::Roll;
    use serde_json::json;

    const TWO_ACCOUNTS: &[u8] = include_bytes!("../tests/fixtures/uigf/v4.2-two-accounts.json");

    /// The fixture's first account's three rolls, all with a pool ID.
    fn rolls() -> Vec<Roll> {
        let account = uigf::read(TWO_ACCOUNTS).unwrap().accounts.remove(0);
        account.history.unwrap().rolls
    }
    fn history(uid: &str, server: &str, timezone: Option<i32>, rolls: Vec<Roll>) -> AccountHistory {
        let rolls = rolls
            .into_iter()
            .map(|roll| Roll {
                uid: uid.into(),
                ..roll
            })
            .collect();
        AccountHistory {
            uid: uid.into(),
            server: server.into(),
            timezone,
            rolls,
        }
    }
    fn exported(uid: &str, server: &str, outcome: Exported) -> ExportedAccount {
        ExportedAccount {
            uid: uid.into(),
            server: server.into(),
            outcome,
        }
    }

    #[test]
    fn histories_become_a_uigf_file_that_reads_back_saying_what_was_left_out() {
        let mut partly = rolls();
        partly[1].gacha_id = None;
        let histories = [
            history("800000001", "prod_official_asia", Some(8), partly),
            history("700000003", "prod_official_eur", None, rolls()),
        ];
        let export = build(&histories, "1.3.0", 1_767_225_600, &uigf::schema()).unwrap();
        assert_eq!(
            export.accounts,
            [
                exported(
                    "800000001",
                    "prod_official_asia",
                    Exported::Rolls {
                        written: 2,
                        without_pool_id: 1
                    }
                ),
                exported("700000003", "prod_official_eur", Exported::NoTimezone),
            ]
        );
        let file = uigf::read(&export.bytes).unwrap();
        assert_eq!(file.accounts.len(), 1);
        let rolls = &file.accounts[0].history.as_ref().unwrap().rolls;
        let ids: Vec<_> = rolls.iter().map(|roll| roll.id.as_str()).collect();
        assert_eq!(ids, [&histories[0].rolls[0].id, &histories[0].rolls[2].id]);
        let document: serde_json::Value = serde_json::from_slice(&export.bytes).unwrap();
        assert_eq!(document["info"]["export_app_version"], json!("1.3.0"));
        assert_eq!(document["info"]["export_timestamp"], json!(1_767_225_600));
        // The file stays out of debug output; what was left out does not.
        let debug = format!("{export:?}");
        assert!(debug.starts_with(r#"Export { bytes: "[redacted]", accounts: ["#));
        assert!(!debug.contains(&histories[0].rolls[0].id));
    }

    #[test]
    fn an_export_without_a_roll_to_write_is_refused_saying_why() {
        let mut unpooled = rolls();
        for roll in &mut unpooled {
            roll.gacha_id = None;
        }
        let histories = [
            history("800000001", "prod_official_asia", Some(8), unpooled),
            history("700000003", "prod_official_eur", None, rolls()),
        ];
        assert_eq!(
            build(&histories, "1.3.0", 0, &uigf::schema()),
            Err(Refusal::NothingToExport(vec![
                exported(
                    "800000001",
                    "prod_official_asia",
                    Exported::Rolls {
                        written: 0,
                        without_pool_id: 3
                    }
                ),
                exported("700000003", "prod_official_eur", Exported::NoTimezone),
            ]))
        );
        // With no saved accounts, nothing was left out either.
        assert_eq!(
            build(&[], "1.3.0", 0, &uigf::schema()),
            Err(Refusal::NothingToExport(Vec::new()))
        );
    }

    #[test]
    fn a_document_the_schema_refuses_is_not_exported() {
        let histories = [history("800000001", "prod_official_asia", Some(8), rolls())];
        // Stricter than UIGF's: no account may have a time zone ahead of UTC.
        let stricter = jsonschema::validator_for(&json!({
            "properties": { "hkrpg": { "items": { "properties": { "timezone": { "maximum": 0 } } } } }
        }))
        .unwrap();
        assert_eq!(
            build(&histories, "1.3.0", 0, &stricter),
            Err(Refusal::Invalid)
        );
        let west = [history(
            "800000001",
            "prod_official_asia",
            Some(-5),
            rolls(),
        )];
        assert!(build(&west, "1.3.0", 0, &stricter).is_ok());
    }
}
