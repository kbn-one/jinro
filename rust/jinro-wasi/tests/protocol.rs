//! The JSON protocol, end to end through `handle_json`.

use jinro_wasi::handle_json;
use serde_json::{json, Value};

fn call(req: Value) -> Value {
    serde_json::from_str(&handle_json(&req.to_string())).unwrap()
}

#[test]
fn create_then_two_days() {
    let roles: Vec<Value> = ["villager", "villager", "seer", "wolf"]
        .iter()
        .map(|r| json!({"roleType": r, "opts": []}))
        .collect();
    let created = call(json!({"op": "createVillage", "roles": roles, "rule": {"vote": {"tag": "public"}}}));
    let ok = &created["ok"];
    assert_eq!(ok["today"]["dayNumber"], 0);
    assert_eq!(ok["village"]["creatures"][2]["id"], "c3");
    // the seer can divine on day 0
    let seer = &ok["today"]["creatureStatuses"][2];
    assert_eq!(seer["roleType"], "seer");
    assert_eq!(seer["availableActions"][0]["actionType"], "divine");

    let mut village = ok["village"].clone();
    for day in 0..2 {
        let r = call(json!({
            "op": "processDay",
            "village": village,
            "actions": [{"actor": "c3", "actionType": "divine", "target": "c1"}],
        }));
        let ok = &r["ok"];
        let last = &ok["village"]["days"][day];
        assert_eq!(last["dayNumber"], day);
        assert_eq!(last["logs"][0]["id"], format!("{day}-0"));
        assert_eq!(last["logs"][0]["logResult"], json!({"tag": "non-wolf"}));
        assert_eq!(last["logs"][0]["receivers"], json!({"tag": "only", "val": ["c3"]}));
        assert_eq!(ok["today"]["dayNumber"], day + 1);
        // absent options are omitted, not null
        assert!(ok["result"].get("voted").is_none());
        village = ok["village"].clone();
    }
}

#[test]
fn errors_are_reported_not_panicked() {
    assert!(call(json!({"op": "nope"}))["error"].as_str().unwrap().starts_with("bad request"));
    let roles = json!([{"roleType": "wolf", "opts": []}]);
    let v = call(json!({"op": "createVillage", "roles": roles, "rule": {"vote": {"tag": "public"}}}))["ok"]["village"].clone();
    let r = call(json!({"op": "processDay", "village": v, "actions": [{"actor": "c9", "actionType": "vote", "target": "c1"}]}));
    assert_eq!(r["error"], "unknown creature id: c9");
}
