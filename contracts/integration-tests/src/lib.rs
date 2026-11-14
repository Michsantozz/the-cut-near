//! Helpers for the sandbox tests: a local NEAR node with The Cut deployed on
//! `thecut.sandbox`, funded test accounts, a test model key that signs moves, and thin
//! wrappers around `near-api` calls.

use std::sync::{Arc, Mutex};

use anyhow::{Context, Result, anyhow};
use ed25519_dalek::{Signer as _, SigningKey};
use near_api::types::transaction::result::ExecutionSuccess;
use near_api::{Account, AccountId, Contract, NearGas, NearToken, NetworkConfig, Signer};
use near_sandbox::Sandbox;
use near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

pub const ONE_CUT: u128 = 1_000_000_000_000_000_000;
pub const SEC: u64 = 1_000_000_000;
pub const MODEL_ID: &str = "z-ai/glm-5.3-flash";

/// The model's TEE key in these tests: its public key is the launch's only model signer.
pub fn model_key() -> SigningKey {
    SigningKey::from_bytes(&[7u8; 32])
}

/// Lowercase hex of `bytes`.
pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// The model's signature (hex) over `"<model_id>:<sha256(request)>:<sha256(response)>"`.
pub fn sign(request: &str, response: &str) -> String {
    let text = format!(
        "{MODEL_ID}:{}:{}",
        hex(&Sha256::digest(request.as_bytes())),
        hex(&Sha256::digest(response.as_bytes()))
    );
    hex(&model_key().sign(text.as_bytes()).to_bytes())
}

/// Builds `thecut` (which embeds the committed agent wasm) with `cargo near`.
pub fn build_thecut() -> Result<Vec<u8>> {
    let manifest = concat!(env!("CARGO_MANIFEST_DIR"), "/../thecut/Cargo.toml");
    let opts = cargo_near_build::BuildOpts::builder()
        .manifest_path(manifest)
        .build();
    let path = cargo_near_build::build_with_cli(opts).map_err(|e| anyhow!("{e:?}"))?;
    std::fs::read(path).context("reading thecut.wasm")
}

/// A running sandbox with The Cut deployed.
pub struct World {
    pub sandbox: Sandbox,
    pub network: NetworkConfig,
    pub signer: Arc<Signer>,
    pub contract: AccountId,
    /// Every log line of every transaction sent through `World`, in order.
    pub logs: Mutex<Vec<String>>,
}

/// Launch parameters for the sandbox.
pub struct Launch {
    pub stage_size: u32,
    pub min_season: u32,
    pub first_cut_in_secs: u64,
    pub cut_interval_secs: u64,
    pub move_lead_secs: u64,
    pub pool_near: NearToken,
}

impl World {
    pub async fn start(wasm: Vec<u8>, launch: Launch) -> Result<Self> {
        let sandbox = Sandbox::start_sandbox().await?;
        let network = NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
        let signer = Signer::from_secret_key(DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;
        let contract: AccountId = "thecut.sandbox".parse()?;
        sandbox
            .create_account(contract.as_str().parse()?)
            .initial_balance(NearToken::from_near(100))
            .send()
            .await?;
        let world = Self {
            sandbox,
            network,
            signer,
            contract: contract.clone(),
            logs: Mutex::new(Vec::new()),
        };
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_nanos() as u64;
        let first_cut_at = now + launch.first_cut_in_secs * SEC;
        let deployed = Contract::deploy(contract)
            .use_code(wasm)
            .with_init_call(
                "new",
                json!({
                    "fee_bps": 100,
                    "pot_bps": 5000,
                    "burn_bps": 5000,
                    "savers_bps": 9000,
                    "agents_bps": 500,
                    "stage_size": launch.stage_size,
                    "min_season": launch.min_season,
                    "first_cut_at": first_cut_at.to_string(),
                    "cut_interval": (launch.cut_interval_secs * SEC).to_string(),
                    "move_lead": (launch.move_lead_secs * SEC).to_string(),
                    "think_fee": (10 * ONE_CUT).to_string(),
                    "min_seed": (1_000 * ONE_CUT).to_string(),
                    "agent_funding": NearToken::from_millinear(300),
                    "register_deposit": NearToken::from_near(1),
                    "model_id": MODEL_ID,
                    "model_signers": [hex(model_key().verifying_key().as_bytes())],
                    "max_tokens": 1200,
                    "reasoning_effort": "low",
                }),
            )?
            .deposit(launch.pool_near)
            .gas(NearGas::from_tgas(300))
            .with_signer(world.signer.clone())
            .send_to(&world.network)
            .await?;
        world.record(deployed.logs());
        deployed.assert_success();
        Ok(world)
    }

    /// Creates `<name>.sandbox` with `near` NEAR and the genesis key.
    pub async fn account(&self, name: &str, near: u128) -> Result<AccountId> {
        let id: AccountId = format!("{name}.sandbox").parse()?;
        self.sandbox
            .create_account(id.as_str().parse()?)
            .initial_balance(NearToken::from_near(near))
            .send()
            .await?;
        Ok(id)
    }

    /// Calls a change method; returns the outcome without asserting it.
    pub async fn try_call(
        &self,
        who: &AccountId,
        method: &str,
        args: Value,
        deposit: NearToken,
    ) -> Result<Result<ExecutionSuccess, String>> {
        let result = Contract(self.contract.clone())
            .call_function(method, args)
            .transaction()
            .deposit(deposit)
            .gas(NearGas::from_tgas(300))
            .with_signer(who.clone(), self.signer.clone())
            .send_to(&self.network)
            .await?;
        self.record(result.logs());
        Ok(result.into_result().map_err(|e| format!("{e:?}")))
    }

    /// Calls a change method and requires it to succeed.
    pub async fn call(
        &self,
        who: &AccountId,
        method: &str,
        args: Value,
        deposit: NearToken,
    ) -> Result<ExecutionSuccess> {
        self.try_call(who, method, args, deposit)
            .await?
            .map_err(|e| anyhow!("{method} failed: {e}"))
    }

    fn record(&self, logs: Vec<&str>) {
        let mut all = self.logs.lock().expect("logs lock");
        all.extend(logs.into_iter().map(str::to_string));
    }

    /// Every NEP-297 event logged so far, parsed.
    pub fn events(&self) -> Vec<Value> {
        self.logs
            .lock()
            .expect("logs lock")
            .iter()
            .filter_map(|line| line.strip_prefix("EVENT_JSON:"))
            .map(|body| serde_json::from_str(body).expect("event JSON"))
            .collect()
    }

    /// Deletes every access key of the main contract account, as the launch script does
    /// right after `new`.
    pub async fn lock_contract_account(&self) -> Result<()> {
        let keys: Vec<_> = Account(self.contract.clone())
            .list_keys()
            .fetch_from(&self.network)
            .await?
            .data
            .into_iter()
            .map(|(key, _)| key)
            .collect();
        Account(self.contract.clone())
            .delete_keys(keys)
            .with_signer(self.signer.clone())
            .send_to(&self.network)
            .await?
            .assert_success();
        Ok(())
    }

    pub async fn view(&self, method: &str, args: Value) -> Result<Value> {
        Ok(Contract(self.contract.clone())
            .call_function(method, args)
            .read_only::<Value>()
            .fetch_from(&self.network)
            .await?
            .data)
    }

    pub async fn near_balance(&self, id: &AccountId) -> Result<u128> {
        Ok(Account(id.clone())
            .tokens()
            .near_balance()
            .fetch_from(&self.network)
            .await?
            .total
            .as_yoctonear())
    }

    pub async fn exists(&self, id: &AccountId) -> bool {
        Account(id.clone())
            .view()
            .fetch_from(&self.network)
            .await
            .is_ok()
    }

    /// Bytes of state the account stakes NEAR for (code included).
    pub async fn storage_usage(&self, id: &AccountId) -> Result<u64> {
        Ok(Account(id.clone())
            .view()
            .fetch_from(&self.network)
            .await?
            .data
            .storage_usage)
    }

    pub async fn access_key_count(&self, id: &AccountId) -> Result<usize> {
        Ok(Account(id.clone())
            .list_keys()
            .fetch_from(&self.network)
            .await?
            .data
            .len())
    }

    pub async fn cut_balance(&self, id: &AccountId) -> Result<u128> {
        let value = self
            .view("ft_balance_of", json!({ "account_id": id }))
            .await?;
        parse_u128(&value)
    }

    /// Produces blocks until the next cut is due.
    pub async fn wait_for_cut(&self) -> Result<()> {
        for _ in 0..200 {
            if self.view("get_next_cut", json!({})).await?["due"] == json!(true) {
                return Ok(());
            }
            self.sandbox.fast_forward(50).await?;
        }
        Err(anyhow!("the cut never became due"))
    }
}

pub fn parse_u128(value: &Value) -> Result<u128> {
    value
        .as_str()
        .ok_or_else(|| anyhow!("expected a string number, got {value}"))?
        .parse()
        .context("parsing u128")
}
