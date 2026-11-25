//! The update check (E25-05, `.docs/development/releasing.md`). The updater plugin's own JS `check()` cannot change
//! the endpoint, so the channel's manifest is chosen here; the found update goes into the webview's resource table as
//! the plugin's `check` does, so the plugin's JS `Update` downloads and installs it.

use serde::{Deserialize, Serialize};
use tauri::{Manager, Runtime, Url, Webview};
use tauri_plugin_updater::UpdaterExt;

const MANIFESTS: &str = "https://github.com/lucas-labs/lut/releases/download/updater";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Channel {
    Stable,
    Beta,
}

fn manifest_url(channel: Channel) -> Url {
    let file = match channel {
        Channel::Stable => "stable.json",
        Channel::Beta => "beta.json",
    };
    Url::parse(&format!("{MANIFESTS}/{file}")).expect("valid manifest url")
}

/// The fields of the plugin's JS `UpdateMetadata`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    rid: tauri::ResourceId,
    current_version: String,
    version: String,
    date: Option<String>,
    body: Option<String>,
    raw_json: serde_json::Value,
}

/// Checks the channel's manifest; `None` when lut is up to date. A dev build never checks: it is not an installed
/// lut and makes no request.
#[tauri::command]
pub async fn updates_check<R: Runtime>(
    webview: Webview<R>,
    channel: Channel,
) -> Result<Option<UpdateMetadata>, String> {
    if cfg!(debug_assertions) {
        return Ok(None);
    }
    let updater = webview
        .updater_builder()
        .endpoints(vec![manifest_url(channel)])
        .and_then(|builder| builder.build())
        .map_err(|error| error.to_string())?;
    let Some(update) = updater.check().await.map_err(|error| error.to_string())? else {
        return Ok(None);
    };
    let date = update
        .raw_json
        .get("pub_date")
        .and_then(|value| value.as_str())
        .map(str::to_owned);
    Ok(Some(UpdateMetadata {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        date,
        body: update.body.clone(),
        raw_json: update.raw_json.clone(),
        rid: webview.resources_table().add(update),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_channel_reads_its_manifest_on_the_updater_release() {
        assert_eq!(
            manifest_url(Channel::Stable).as_str(),
            "https://github.com/lucas-labs/lut/releases/download/updater/stable.json"
        );
        assert_eq!(
            manifest_url(Channel::Beta).as_str(),
            "https://github.com/lucas-labs/lut/releases/download/updater/beta.json"
        );
    }

    #[test]
    fn channel_comes_from_its_lowercase_name() {
        assert_eq!(
            serde_json::from_str::<Channel>("\"beta\"").unwrap(),
            Channel::Beta
        );
        assert!(serde_json::from_str::<Channel>("\"nightly\"").is_err());
    }
}
