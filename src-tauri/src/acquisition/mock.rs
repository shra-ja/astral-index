//! A synthetic HoYoverse for the mock debug binary
//! ([decision 0014](../../../docs/decisions/0014-mock-debug-binary.md)). It answers
//! each history request with generated pages, as a scenario chooses, and sends
//! nothing anywhere. The shipped app never constructs it.
use super::{COLLABORATION_ENDPOINT, ENDPOINTS, Transport, TransportError};

/// The environment variable that chooses the mock binary's scenario.
pub const VARIABLE: &str = "ROLL_TRACKER_MOCK_SCENARIO";

/// What the synthetic HoYoverse does.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scenario {
    /// Every category has history, over several pages where it is long.
    History,
    /// The link has expired (`retcode -101`).
    ExpiredLink,
    /// Light Cone Event Warp cannot be reached; earlier categories succeed.
    NetworkFailure,
    /// HoYoverse refuses requests as too frequent (`retcode -110`).
    RateLimited,
    /// The account has no history.
    NoHistory,
    /// `History`, with newer rolls in every category.
    NewerHistory,
    /// Another account, on another server, with the same roll IDs as `History`.
    SecondAccount,
    /// `History`, but Light Cone Event Warp belongs to another account.
    MixedAccounts,
}

/// The variable named no known scenario.
#[derive(Debug, PartialEq, Eq)]
pub struct UnknownScenario;

impl Scenario {
    /// The scenario a variable's value names; unset or empty means `History`.
    pub fn named(name: Option<&str>) -> Result<Self, UnknownScenario> {
        match name.unwrap_or_default() {
            "" | "history" => Ok(Self::History),
            "expired-link" => Ok(Self::ExpiredLink),
            "network-failure" => Ok(Self::NetworkFailure),
            "rate-limited" => Ok(Self::RateLimited),
            "no-history" => Ok(Self::NoHistory),
            "newer-history" => Ok(Self::NewerHistory),
            "second-account" => Ok(Self::SecondAccount),
            "mixed-accounts" => Ok(Self::MixedAccounts),
            _ => Err(UnknownScenario),
        }
    }
}

/// How many rolls each category holds in the `History` scenario.
const ROLLS: [(&str, u64); 6] = [
    ("1", 300),
    ("2", 50),
    ("11", 1250),
    ("12", 412),
    ("21", 38),
    ("22", 10),
];
/// The collaboration endpoint's page cap, as HoYoverse's.
const COLLABORATION_PAGE: u64 = 20;
/// How many newer rolls each category gains in the `NewerHistory` scenario.
const NEWER: u64 = 25;
const NEWEST: &str = "2026-09-28 21:14:03";

/// Whose history a page holds: a UID, its server and the server's time zone.
struct Account {
    uid: &'static str,
    server: &'static str,
    time_zone: i64,
}
const FIRST: Account = Account {
    uid: "100000001",
    server: "prod_official_asia",
    time_zone: 8,
};
const SECOND: Account = Account {
    uid: "100000002",
    server: "prod_official_usa",
    time_zone: -5,
};

/// Answers history requests from a scenario. Pages are generated from the request's
/// category, cursor and size alone, so any order of requests gets consistent pages.
pub struct MockTransport {
    scenario: Scenario,
}
impl MockTransport {
    pub fn new(scenario: Scenario) -> Self {
        Self { scenario }
    }
}
impl Transport for MockTransport {
    async fn get(&self, url: &str) -> Result<Vec<u8>, TransportError> {
        let Some(endpoint) = ENDPOINTS
            .iter()
            .find(|endpoint| url.starts_with(**endpoint))
        else {
            return Err(TransportError::UnsupportedUrl);
        };
        // Every endpoint ends with "?", so the query follows it.
        let query = &url[endpoint.len()..];
        let category = parameter(query, "gacha_type");
        match self.scenario {
            Scenario::ExpiredLink => Ok(api_error(-101)),
            Scenario::RateLimited => Ok(api_error(-110)),
            Scenario::NetworkFailure if category == Some("12") => Err(TransportError::Connection),
            Scenario::NoHistory => Ok(page(&[], &FIRST)),
            _ => {
                let account = match (self.scenario, category) {
                    (Scenario::SecondAccount, _) | (Scenario::MixedAccounts, Some("12")) => &SECOND,
                    _ => &FIRST,
                };
                let newer = if self.scenario == Scenario::NewerHistory {
                    NEWER
                } else {
                    0
                };
                let size: u64 = parameter(query, "size")
                    .map_or(Ok(0), str::parse)
                    .unwrap_or(0);
                let size = if *endpoint == COLLABORATION_ENDPOINT {
                    size.min(COLLABORATION_PAGE)
                } else {
                    size
                };
                let rolls = category.map_or(Vec::new(), |category| {
                    let end_id = parameter(query, "end_id").unwrap_or("0");
                    rolls(category, end_id, size, newer, account)
                });
                Ok(page(&rolls, account))
            }
        }
    }
}

/// A query parameter's value, exactly as written.
fn parameter<'a>(query: &'a str, name: &str) -> Option<&'a str> {
    query
        .split('&')
        .find_map(|pair| pair.strip_prefix(name)?.strip_prefix('='))
}

/// A category's rolls after the cursor, up to `size`, newest first. Each category
/// counts IDs down from its own base, and ten rolls share each time, like a ten-pull.
/// `newer` rolls come before the base, with IDs and times above it; a roll's fields
/// depend only on its ID, so every scenario serves a roll the same way.
fn rolls(
    category: &str,
    end_id: &str,
    size: u64,
    newer: u64,
    account: &Account,
) -> Vec<serde_json::Value> {
    let Some((_, count)) = ROLLS.iter().find(|(code, _)| *code == category) else {
        return Vec::new();
    };
    let code: u64 = category.parse().unwrap_or(0);
    let base = 1_800_000_000_000_000_000 + code * 10_000_000;
    let top = base + newer;
    let start = match end_id.parse::<u64>() {
        Ok(0) | Err(_) => 0,
        Ok(cursor) => top.saturating_sub(cursor) + 1,
    };
    let newest =
        chrono::NaiveDateTime::parse_from_str(NEWEST, "%Y-%m-%d %H:%M:%S").unwrap_or_default();
    let light_cones = category == "12" || category == "22";
    (start..(start + size).min(count + newer))
        .map(|index| {
            // How far the roll is from the base: negative for newer rolls.
            let age = i64::try_from(index).unwrap_or(0) - i64::try_from(newer).unwrap_or(0);
            let rarity = match (age.rem_euclid(70), age.rem_euclid(10)) {
                (6, _) => "5",
                (_, 3) => "4",
                _ => "3",
            };
            let minutes = age.div_euclid(10) * 37 + i64::try_from(code).unwrap_or(0);
            let time = newest - chrono::Duration::minutes(minutes);
            let (name, kind) = item(rarity, light_cones, age);
            serde_json::json!({
                "uid": account.uid,
                "id": (top - index).to_string(),
                "gacha_id": "1001",
                "gacha_type": category,
                "item_id": format!("{rarity}{:03}", age.rem_euclid(7)),
                "count": "1",
                "time": time.format("%Y-%m-%d %H:%M:%S").to_string(),
                "name": name,
                "lang": "en",
                "item_type": kind,
                "rank_type": rarity,
            })
        })
        .collect()
}

/// A synthetic item for a rarity: event characters, or light cones on their banners.
fn item(rarity: &str, light_cones: bool, age: i64) -> (&'static str, &'static str) {
    const THREE: [&str; 5] = ["Arrows", "Cornucopia", "Defense", "Darkness", "Loop"];
    let pick = |names: &[&'static str]| {
        let count = i64::try_from(names.len()).unwrap_or(1);
        names[usize::try_from(age.rem_euclid(count)).unwrap_or(0)]
    };
    match (rarity, light_cones) {
        ("5", false) => (pick(&["Acheron", "Himeko", "Firefly"]), "Character"),
        ("5", true) => (
            pick(&["Along the Passing Shore", "Night on the Milky Way"]),
            "Light Cone",
        ),
        ("4", false) => (pick(&["Pela", "Hanya", "Sampo"]), "Character"),
        ("4", true) => (
            pick(&["Past and Future", "Dance! Dance! Dance!"]),
            "Light Cone",
        ),
        _ => (pick(&THREE), "Light Cone"),
    }
}

/// A successful page holding `rolls`, from the account's server.
fn page(rolls: &[serde_json::Value], account: &Account) -> Vec<u8> {
    serde_json::json!({
        "retcode": 0,
        "message": "OK",
        "data": {
            "page": "1",
            "size": "0",
            "region": account.server,
            "region_time_zone": account.time_zone,
            "list": rolls,
        },
    })
    .to_string()
    .into_bytes()
}

/// HoYoverse's reply for a refused request.
fn api_error(code: i64) -> Vec<u8> {
    serde_json::json!({ "retcode": code, "message": "synthetic", "data": null })
        .to_string()
        .into_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acquisition::tests::scripted::ignore;
    use crate::acquisition::{
        AcquisitionError, Category, ENDPOINT, FetchFailure, RequestContext,
        extract_request_contexts, fetch_history,
    };
    use crate::{ParseError, parse_response};
    use std::{collections::HashMap, future::Future};

    fn run<T>(future: impl Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(future)
    }
    /// The cached request validation sends unchanged; it names no category.
    fn cached() -> String {
        format!(
            "{ENDPOINT}authkey=synthetic&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en"
        )
    }
    fn context() -> RequestContext {
        extract_request_contexts(format!("1/0/{}\0", cached()).as_bytes())
            .unwrap()
            .remove(0)
            .into_context()
    }
    fn fetch(scenario: Scenario) -> Result<crate::acquisition::History, AcquisitionError> {
        run(fetch_history(
            &MockTransport::new(scenario),
            &context(),
            &ignore,
            None,
        ))
    }

    #[test]
    fn scenarios_are_named_by_the_variable() {
        for (name, scenario) in [
            (None, Scenario::History),
            (Some(""), Scenario::History),
            (Some("history"), Scenario::History),
            (Some("expired-link"), Scenario::ExpiredLink),
            (Some("network-failure"), Scenario::NetworkFailure),
            (Some("rate-limited"), Scenario::RateLimited),
            (Some("no-history"), Scenario::NoHistory),
            (Some("newer-history"), Scenario::NewerHistory),
            (Some("second-account"), Scenario::SecondAccount),
            (Some("mixed-accounts"), Scenario::MixedAccounts),
        ] {
            assert_eq!(Scenario::named(name), Ok(scenario));
        }
        assert_eq!(Scenario::named(Some("anything else")), Err(UnknownScenario));
        assert_eq!(VARIABLE, "ROLL_TRACKER_MOCK_SCENARIO");
    }

    #[test]
    fn only_the_history_endpoints_are_answered() {
        let transport = MockTransport::new(Scenario::History);
        assert_eq!(
            run(transport.get("https://example.com/getGachaLog?gacha_type=1")),
            Err(TransportError::UnsupportedUrl)
        );
    }

    #[test]
    fn validation_and_unknown_categories_get_an_empty_page() {
        let transport = MockTransport::new(Scenario::History);
        for url in [cached(), format!("{}&gacha_type=99&size=5", cached())] {
            let body = run(transport.get(&url)).unwrap();
            assert!(parse_response(&body).unwrap().list.is_empty());
        }
    }

    #[test]
    fn history_fills_every_category_newest_first_over_several_pages() {
        let history = fetch(Scenario::History).unwrap();
        let account = history.account().unwrap();
        assert_eq!(
            (account.uid(), account.server()),
            ("100000001", "prod_official_asia")
        );
        let mut counts: HashMap<String, usize> = HashMap::new();
        let mut rarities: HashMap<(String, String), usize> = HashMap::new();
        let mut last: HashMap<String, (u64, String)> = HashMap::new();
        for body in history.responses() {
            let page = parse_response(body).unwrap();
            assert_eq!(page.region_time_zone, Some(8));
            for roll in page.list {
                *counts.entry(roll.gacha_type.clone()).or_default() += 1;
                *rarities
                    .entry((roll.gacha_type.clone(), roll.rank_type.clone()))
                    .or_default() += 1;
                let id: u64 = roll.id.parse().unwrap();
                if let Some((previous, time)) = last.get(&roll.gacha_type) {
                    assert!(id < *previous, "IDs descend within a category");
                    assert!(roll.time <= *time, "times descend within a category");
                }
                last.insert(roll.gacha_type.clone(), (id, roll.time));
            }
        }
        let expected = [
            ("1", 300),
            ("2", 50),
            ("11", 1250),
            ("12", 412),
            ("21", 38),
            ("22", 10),
        ];
        for (code, count) in expected {
            assert_eq!(counts.get(code), Some(&count), "category {code}");
        }
        assert_eq!(rarities.get(&("11".into(), "5".into())), Some(&18));
        assert_eq!(rarities.get(&("11".into(), "4".into())), Some(&125));
        assert_eq!(rarities.get(&("11".into(), "3".into())), Some(&1107));
        // Each category ends on an empty page. Category 11 needs two pages of 1,000,
        // and the collaboration endpoint caps pages at 20, as HoYoverse's does.
        assert_eq!(history.responses().len(), 2 + 2 + 3 + 2 + 3 + 2);
        for body in history.responses() {
            let page = parse_response(body).unwrap();
            if page
                .list
                .first()
                .is_some_and(|roll| roll.gacha_type == "21")
            {
                assert!(page.list.len() <= 20);
            }
        }
    }

    #[test]
    fn failure_scenarios_fail_as_hoyoverse_would() {
        let validation = |scenario| {
            let body = run(MockTransport::new(scenario).get(&cached())).unwrap();
            parse_response(&body).unwrap_err()
        };
        assert_eq!(validation(Scenario::ExpiredLink), ParseError::Api(-101));
        assert_eq!(validation(Scenario::RateLimited), ParseError::Api(-110));
        let empty = fetch(Scenario::NoHistory).unwrap();
        assert!(empty.account().is_none());
        assert_eq!(
            fetch(Scenario::NetworkFailure).unwrap_err(),
            AcquisitionError::Fetch(FetchFailure::Transient)
        );
        // Earlier categories are served, so the failure comes partway through.
        let transport = MockTransport::new(Scenario::NetworkFailure);
        let page = context().page_request(
            Category::CharacterEvent,
            1.try_into().unwrap(),
            crate::acquisition::Cursor::Start,
        );
        assert!(run(transport.get(page.url())).is_ok());
    }

    /// Every roll retrieved, as HoYoverse sent it, by roll ID.
    fn rolls_by_id(history: &crate::acquisition::History) -> HashMap<String, serde_json::Value> {
        history
            .responses()
            .iter()
            .flat_map(|body| {
                let page: serde_json::Value = serde_json::from_slice(body).unwrap();
                page["data"]["list"].as_array().unwrap().clone()
            })
            .map(|roll| (roll["id"].as_str().unwrap().to_owned(), roll))
            .collect()
    }

    #[test]
    fn newer_history_adds_newer_rolls_and_keeps_every_earlier_one_unchanged() {
        let earlier = rolls_by_id(&fetch(Scenario::History).unwrap());
        let history = fetch(Scenario::NewerHistory).unwrap();
        let account = history.account().unwrap();
        assert_eq!(
            (account.uid(), account.server()),
            ("100000001", "prod_official_asia")
        );
        let newer = rolls_by_id(&history);
        // Each category's earlier rolls come back exactly as before.
        for (id, roll) in &earlier {
            assert_eq!(newer.get(id), Some(roll), "roll {id}");
        }
        let added: Vec<_> = newer
            .iter()
            .filter(|(id, _)| !earlier.contains_key(*id))
            .map(|(_, roll)| roll)
            .collect();
        for (code, _) in ROLLS {
            let category: Vec<_> = added
                .iter()
                .filter(|roll| roll["gacha_type"] == code)
                .collect();
            assert_eq!(category.len(), 25, "category {code}");
            // They are newer than every earlier roll of their category.
            let newest_earlier = earlier
                .values()
                .filter(|roll| roll["gacha_type"] == code)
                .map(|roll| roll["id"].as_str().unwrap().parse::<u64>().unwrap())
                .max()
                .unwrap();
            for roll in category {
                assert!(roll["id"].as_str().unwrap().parse::<u64>().unwrap() > newest_earlier);
                assert!(roll["time"].as_str().unwrap() > NEWEST);
            }
        }
    }

    #[test]
    fn the_second_account_has_the_same_roll_ids_on_another_server() {
        let first = rolls_by_id(&fetch(Scenario::History).unwrap());
        let history = fetch(Scenario::SecondAccount).unwrap();
        let account = history.account().unwrap();
        assert_eq!(
            (account.uid(), account.server()),
            ("100000002", "prod_official_usa")
        );
        for body in history.responses() {
            assert_eq!(parse_response(body).unwrap().region_time_zone, Some(-5));
        }
        let second = rolls_by_id(&history);
        assert_eq!(second.len(), first.len());
        for (id, roll) in second {
            let mut same = roll.clone();
            same["uid"] = serde_json::json!(FIRST.uid);
            assert_eq!(first.get(&id), Some(&same), "roll {id}");
        }
    }

    #[test]
    fn mixed_accounts_disagree_on_the_uid_between_categories() {
        assert_eq!(
            fetch(Scenario::MixedAccounts).unwrap_err(),
            AcquisitionError::MixedAccounts
        );
    }
}
