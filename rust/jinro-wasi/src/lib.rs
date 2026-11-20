//! JSON protocol over `jinro-core`, for the WASI command in `main.rs`.
//!
//! One request in, one response out:
//!
//! ```text
//! {"op":"createVillage","roles":[{"roleType":"wolf","opts":[]}, ...],"rule":{"vote":{"tag":"public"}}}
//!   -> {"ok":{"village":{...},"today":{...}}}
//! {"op":"processDay","village":{...},"actions":[{"actor":"c1","actionType":"vote","target":"c2"}]}
//!   -> {"ok":{"result":{...},"village":{...},"today":{...}}}
//! anything that fails
//!   -> {"error":"..."}
//! ```
//!
//! The shapes follow `rust/jinro-wasm/wit/world.wit` as jco renders it in JavaScript: camelCase
//! fields, enums as kebab-case strings, variants as `{"tag":..,"val":..}`, absent options omitted.
//! The engine is stateless (the village is the whole history), so every call stands alone.
//!
//! Like `jinro-wasm`, this is unverified glue: it turns string ids into the core's indices and
//! rejects unknown ids, so the core can assume every id is in range.

use jinro_core as core_;
use serde::{Deserialize, Serialize};

// ---- wire types ------------------------------------------------------------

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum Team {
    Villagers,
    Wolves,
    Hamsters,
    Lovers,
}

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum ActionType {
    Vote,
    Unknown,
    Bite,
    Divine,
    Medium,
    Guard,
    HamsterCurse,
    Love,
    LoversSuicide,
    FakeLove,
}

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum CauseOfDeath {
    Executed,
    FoundDead,
}

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum RoleType {
    Villager,
    Seer,
    Bodyguard,
    Wolf,
    Madman,
    Lover,
    Bitch,
    Medium,
    Hamster,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
#[serde(tag = "tag", content = "val", rename_all = "kebab-case")]
pub enum Receivers {
    All,
    Afterall,
    Only(Vec<String>),
}

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Debug)]
#[serde(tag = "tag", rename_all = "kebab-case")]
pub enum LogResult {
    Dead,
    Guarded,
    Partnered,
    Wolf,
    NonWolf,
    Survived,
}

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Debug)]
#[serde(tag = "tag", rename_all = "kebab-case")]
pub enum VoteRule {
    Public,
    Private,
}

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Debug)]
pub struct Rule {
    pub vote: VoteRule,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Role {
    pub role_type: RoleType,
    #[serde(default)]
    pub opts: Vec<(String, String)>,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
pub struct Creature {
    pub id: String,
    pub role: Role,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Action {
    pub actor: String,
    pub action_type: ActionType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Log {
    pub id: String,
    pub receivers: Receivers,
    pub action_type: ActionType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub log_result: Option<LogResult>,
}

/// One processed cycle. `day_number` is 0-based and equals the index in `village.days`.
#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Day {
    pub day_number: i32,
    pub actions: Vec<Action>,
    pub logs: Vec<Log>,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
pub struct Village {
    pub rule: Rule,
    pub creatures: Vec<Creature>,
    pub days: Vec<Day>,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AvailableAction {
    pub action_type: ActionType,
    pub targets: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreatureStatus {
    pub id: String,
    pub role_type: RoleType,
    pub team: Team,
    pub available_actions: Vec<AvailableAction>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cause_of_death: Option<CauseOfDeath>,
    pub log_ids: Vec<String>,
}

/// The day to play next: 0 right after `createVillage`, then `village.days.length`.
#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Today {
    pub day_number: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub winner: Option<Team>,
    pub creature_statuses: Vec<CreatureStatus>,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
pub struct DayResult {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub voted: Option<String>,
    pub deads: Vec<String>,
    pub logs: Vec<Log>,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum Request {
    CreateVillage { roles: Vec<Role>, rule: Rule },
    ProcessDay { village: Village, actions: Vec<Action> },
}

#[derive(Serialize, Debug)]
#[serde(untagged)]
pub enum Ok {
    Created { village: Village, today: Today },
    Processed { result: DayResult, village: Village, today: Today },
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub enum Response {
    Ok(Ok),
    Error(String),
}

// ---- enums ---------------------------------------------------------------

fn role_in(r: RoleType) -> core_::RoleType {
    use core_::RoleType as C;
    match r {
        RoleType::Villager => C::Villager,
        RoleType::Seer => C::Seer,
        RoleType::Bodyguard => C::Bodyguard,
        RoleType::Wolf => C::Wolf,
        RoleType::Madman => C::Madman,
        RoleType::Lover => C::Lover,
        RoleType::Bitch => C::Bitch,
        RoleType::Medium => C::Medium,
        RoleType::Hamster => C::Hamster,
    }
}

fn role_out(r: core_::RoleType) -> RoleType {
    use core_::RoleType as C;
    match r {
        C::Villager => RoleType::Villager,
        C::Seer => RoleType::Seer,
        C::Bodyguard => RoleType::Bodyguard,
        C::Wolf => RoleType::Wolf,
        C::Madman => RoleType::Madman,
        C::Lover => RoleType::Lover,
        C::Bitch => RoleType::Bitch,
        C::Medium => RoleType::Medium,
        C::Hamster => RoleType::Hamster,
    }
}

fn team_out(t: core_::Team) -> Team {
    match t {
        core_::Team::Villagers => Team::Villagers,
        core_::Team::Wolves => Team::Wolves,
        core_::Team::Lovers => Team::Lovers,
        core_::Team::Hamsters => Team::Hamsters,
    }
}

fn act_in(a: ActionType) -> core_::ActionType {
    use core_::ActionType as C;
    match a {
        ActionType::Vote => C::Vote,
        ActionType::Unknown => C::Unknown,
        ActionType::Bite => C::Bite,
        ActionType::Divine => C::Divine,
        ActionType::Medium => C::Medium,
        ActionType::Guard => C::Guard,
        ActionType::HamsterCurse => C::HamsterCurse,
        ActionType::Love => C::Love,
        ActionType::LoversSuicide => C::LoversSuicide,
        ActionType::FakeLove => C::FakeLove,
    }
}

fn act_out(a: core_::ActionType) -> ActionType {
    use core_::ActionType as C;
    match a {
        C::Vote => ActionType::Vote,
        C::Unknown => ActionType::Unknown,
        C::Bite => ActionType::Bite,
        C::Divine => ActionType::Divine,
        C::Medium => ActionType::Medium,
        C::Guard => ActionType::Guard,
        C::HamsterCurse => ActionType::HamsterCurse,
        C::Love => ActionType::Love,
        C::LoversSuicide => ActionType::LoversSuicide,
        C::FakeLove => ActionType::FakeLove,
    }
}

fn result_in(r: LogResult) -> core_::LogResult {
    match r {
        LogResult::Dead => core_::LogResult::Dead,
        LogResult::Guarded => core_::LogResult::Guarded,
        LogResult::Partnered => core_::LogResult::Partnered,
        LogResult::Wolf => core_::LogResult::Wolf,
        LogResult::NonWolf => core_::LogResult::NonWolf,
        LogResult::Survived => core_::LogResult::Survived,
    }
}

fn result_out(r: core_::LogResult) -> LogResult {
    match r {
        core_::LogResult::Dead => LogResult::Dead,
        core_::LogResult::Guarded => LogResult::Guarded,
        core_::LogResult::Partnered => LogResult::Partnered,
        core_::LogResult::Wolf => LogResult::Wolf,
        core_::LogResult::NonWolf => LogResult::NonWolf,
        core_::LogResult::Survived => LogResult::Survived,
    }
}

fn cod_out(c: core_::CauseOfDeath) -> CauseOfDeath {
    match c {
        core_::CauseOfDeath::Executed => CauseOfDeath::Executed,
        core_::CauseOfDeath::FoundDead => CauseOfDeath::FoundDead,
    }
}

// ---- ids -----------------------------------------------------------------

struct Ids<'a>(&'a [Creature]);

impl Ids<'_> {
    fn idx(&self, id: &str) -> Result<usize, String> {
        self.0.iter().position(|c| c.id == id).ok_or_else(|| format!("unknown creature id: {id}"))
    }
    fn opt_idx(&self, id: &Option<String>) -> Result<Option<usize>, String> {
        id.as_deref().map(|s| self.idx(s)).transpose()
    }
    fn id(&self, i: usize) -> String {
        self.0[i].id.clone()
    }
    fn opt_id(&self, i: Option<usize>) -> Option<String> {
        i.map(|i| self.id(i))
    }
}

fn log_id(day: usize, index: usize) -> String {
    format!("{day}-{index}")
}

// ---- records -------------------------------------------------------------

fn action_in(ids: &Ids, a: &Action) -> Result<core_::Action, String> {
    Ok(core_::Action {
        actor: ids.idx(&a.actor)?,
        action_type: act_in(a.action_type),
        target: ids.opt_idx(&a.target)?,
    })
}

fn action_out(ids: &Ids, a: &core_::Action) -> Action {
    Action { actor: ids.id(a.actor), action_type: act_out(a.action_type), target: ids.opt_id(a.target) }
}

fn log_in(ids: &Ids, l: &Log) -> Result<core_::Log, String> {
    let receivers = match &l.receivers {
        Receivers::All => core_::Receivers::All,
        Receivers::Afterall => core_::Receivers::Afterall,
        Receivers::Only(rs) => core_::Receivers::Only(rs.iter().map(|r| ids.idx(r)).collect::<Result<_, _>>()?),
    };
    Ok(core_::Log {
        receivers,
        action_type: act_in(l.action_type),
        actor: ids.opt_idx(&l.actor)?,
        target: ids.opt_idx(&l.target)?,
        result: l.log_result.map(result_in),
    })
}

fn log_out(ids: &Ids, day: usize, index: usize, l: &core_::Log) -> Log {
    let receivers = match &l.receivers {
        core_::Receivers::All => Receivers::All,
        core_::Receivers::Afterall => Receivers::Afterall,
        core_::Receivers::Only(rs) => Receivers::Only(rs.iter().map(|&r| ids.id(r)).collect()),
    };
    Log {
        id: log_id(day, index),
        receivers,
        action_type: act_out(l.action_type),
        actor: ids.opt_id(l.actor),
        target: ids.opt_id(l.target),
        log_result: l.result.map(result_out),
    }
}

fn village_in(v: &Village) -> Result<core_::Village, String> {
    let ids = Ids(&v.creatures);
    for (i, c) in v.creatures.iter().enumerate() {
        if v.creatures[..i].iter().any(|d| d.id == c.id) {
            return Err(format!("duplicate creature id: {}", c.id));
        }
    }
    let days = v
        .days
        .iter()
        .map(|d| {
            Ok(core_::Day {
                actions: d.actions.iter().map(|a| action_in(&ids, a)).collect::<Result<_, _>>()?,
                logs: d.logs.iter().map(|l| log_in(&ids, l)).collect::<Result<_, _>>()?,
            })
        })
        .collect::<Result<_, String>>()?;
    Ok(core_::Village { roles: v.creatures.iter().map(|c| role_in(c.role.role_type)).collect(), days })
}

fn village_out(src: &Village, v: &core_::Village) -> Village {
    let ids = Ids(&src.creatures);
    Village {
        rule: src.rule,
        creatures: src.creatures.clone(),
        days: v
            .days
            .iter()
            .enumerate()
            .map(|(d, day)| Day {
                day_number: d as i32,
                actions: day.actions.iter().map(|a| action_out(&ids, a)).collect(),
                logs: day.logs.iter().enumerate().map(|(i, l)| log_out(&ids, d, i, l)).collect(),
            })
            .collect(),
    }
}

fn today_out(src: &Village, t: &core_::Today) -> Today {
    let ids = Ids(&src.creatures);
    Today {
        day_number: t.day_number as i32,
        winner: t.winner.map(team_out),
        creature_statuses: t
            .creature_statuses
            .iter()
            .enumerate()
            .map(|(i, s)| CreatureStatus {
                id: ids.id(i),
                role_type: role_out(s.role),
                team: team_out(s.team),
                available_actions: s
                    .available_actions
                    .iter()
                    .map(|a| AvailableAction {
                        action_type: act_out(a.action_type),
                        targets: a.targets.iter().map(|&t| ids.id(t)).collect(),
                    })
                    .collect(),
                cause_of_death: s.cause_of_death.map(cod_out),
                log_ids: s.visible_logs.iter().map(|r| log_id(r.day, r.index)).collect(),
            })
            .collect(),
    }
}

// ---- operations ------------------------------------------------------------

pub fn create_village(roles: Vec<Role>, rule: Rule) -> Result<(Village, Today), String> {
    let village = Village {
        rule,
        creatures: roles
            .into_iter()
            .enumerate()
            .map(|(i, role)| Creature { id: format!("c{}", i + 1), role })
            .collect(),
        days: Vec::new(),
    };
    let core_village = village_in(&village)?;
    let today = today_out(&village, &core_::build_today(&core_village));
    Ok((village, today))
}

pub fn process_day(village: Village, actions: Vec<Action>) -> Result<(DayResult, Village, Today), String> {
    let ids = Ids(&village.creatures);
    let cv = village_in(&village)?;
    let ca = actions.iter().map(|a| action_in(&ids, a)).collect::<Result<Vec<_>, _>>()?;
    let (nv, r) = core_::process_day(&cv, &ca);
    let day = nv.days.len() - 1;
    let result = DayResult {
        voted: ids.opt_id(r.voted),
        deads: r.deaths.iter().map(|d| ids.id(d.creature)).collect(),
        logs: r.logs.iter().enumerate().map(|(i, l)| log_out(&ids, day, i, l)).collect(),
    };
    let today = today_out(&village, &core_::build_today(&nv));
    Ok((result, village_out(&village, &nv), today))
}

/// Answers one request. Never panics on bad input: malformed JSON, an unknown `op` or an unknown
/// id all come back as `Response::Error`.
pub fn handle(input: &str) -> Response {
    let request: Request = match serde_json::from_str(input) {
        Result::Ok(r) => r,
        Err(e) => return Response::Error(format!("bad request: {e}")),
    };
    let outcome = match request {
        Request::CreateVillage { roles, rule } => {
            create_village(roles, rule).map(|(village, today)| Ok::Created { village, today })
        }
        Request::ProcessDay { village, actions } => {
            process_day(village, actions).map(|(result, village, today)| Ok::Processed { result, village, today })
        }
    };
    match outcome {
        Result::Ok(ok) => Response::Ok(ok),
        Err(e) => Response::Error(e),
    }
}

/// `handle`, as JSON text.
pub fn handle_json(input: &str) -> String {
    serde_json::to_string(&handle(input)).expect("responses always serialize")
}
