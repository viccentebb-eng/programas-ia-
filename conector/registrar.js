// =====================================================================
//  Registra (o quita) el conector de Programas IA en Claude Desktop y Codex.
//  No toca los otros conectores; antes de cambiar deja una copia .bak.
//    node registrar.js            -> registrar
//    node registrar.js --quitar   -> quitar
// =====================================================================
const fs = require("fs"), path = require("path"), os = require("os");
const quitar = process.argv.includes("--quitar");
const NODE = process.execPath, SERVIDOR = path.join(__dirname, "servidor.js");
const out = [];

function respaldo(f) { if (fs.existsSync(f)) fs.copyFileSync(f, f + ".bak"); }

// ---- Claude Desktop: %APPDATA%\Claude\claude_desktop_config.json
(function claudeDesktop() {
  const dir = path.join(process.env.APPDATA || "", "Claude"), f = path.join(dir, "claude_desktop_config.json");
  if (!fs.existsSync(dir)) { out.push("Claude Desktop: no está instalado"); return; }
  let cfg = {};
  if (fs.existsSync(f)) { try { cfg = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { out.push("Claude Desktop: su configuración no es JSON válido; no la toqué"); return; } }
  cfg.mcpServers = cfg.mcpServers || {};
  if (quitar) { if (!cfg.mcpServers["programas-ia"]) { out.push("Claude Desktop: no estaba"); return; } delete cfg.mcpServers["programas-ia"]; }
  else cfg.mcpServers["programas-ia"] = { command: NODE, args: [SERVIDOR] };
  respaldo(f);
  fs.writeFileSync(f, JSON.stringify(cfg, null, 2));
  out.push("Claude Desktop: " + (quitar ? "quitado" : "listo (reinicia Claude Desktop)"));
})();

// ---- Codex: %USERPROFILE%\.codex\config.toml
(function codex() {
  const dir = path.join(os.homedir(), ".codex"), f = path.join(dir, "config.toml");
  if (!fs.existsSync(dir)) { out.push("Codex: no está instalado"); return; }
  let t = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
  // quitar nuestra seccion si ya estaba (hasta la siguiente seccion que no sea nuestra)
  t = t.replace(/\n?\[mcp_servers\.programas-ia(\.[^\]]*)?\][\s\S]*?(?=\n\[(?!mcp_servers\.programas-ia)|$)/g, "");
  if (!quitar) {
    t = t.replace(/\s*$/, "\n") + "\n[mcp_servers.programas-ia]\n" +
      "command = '" + NODE + "'\n" + "args = ['" + SERVIDOR + "']\n" + "tool_timeout_sec = 600\n";
  }
  respaldo(f);
  fs.writeFileSync(f, t);
  out.push("Codex: " + (quitar ? "quitado" : "listo"));
})();

console.log(out.join(" | "));
