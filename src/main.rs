use std::fs::File;
use std::io::Write;

struct CliArgs {
    source: Option<String>,
    output: Option<String>,
    verbose: bool,
    help: bool,
    web: bool,
    port: Option<u16>,
}

fn parse_args() -> Result<CliArgs, String> {
    let mut args_iter = std::env::args().skip(1);
    let mut source = None;
    let mut output = None;
    let mut verbose = false;
    let mut help = false;
    let mut web = false;
    let mut port = None;

    // Check if the first argument is a subcommand 'web' or 'server'
    if let Some(arg) = std::env::args().nth(1) {
        if arg == "web" || arg == "server" {
            web = true;
            args_iter.next(); // Consume subcommand
        }
    }

    while let Some(arg) = args_iter.next() {
        match arg.as_str() {
            "-h" | "--help" => {
                help = true;
            }
            "-v" => {
                verbose = true;
            }
            "-s" => {
                if let Some(s) = args_iter.next() {
                    source = Some(s);
                } else {
                    return Err("Error: Parameter '-s' requires a value.".to_string());
                }
            }
            "-o" => {
                if let Some(o) = args_iter.next() {
                    output = Some(o);
                } else {
                    return Err("Error: Parameter '-o' requires a value.".to_string());
                }
            }
            "-p" | "--port" => {
                if let Some(p_str) = args_iter.next() {
                    if let Ok(p) = p_str.parse::<u16>() {
                        port = Some(p);
                    } else {
                        return Err(format!("Error: Invalid port number '{}'.", p_str));
                    }
                } else {
                    return Err("Error: Parameter '-p' requires a value.".to_string());
                }
            }
            other => {
                return Err(format!("Error: Unknown option '{}'.", other));
            }
        }
    }

    // If no arguments at all were provided, default to starting the web server.
    if std::env::args().len() == 1 {
        web = true;
    }

    Ok(CliArgs {
        source,
        output,
        verbose,
        help,
        web,
        port,
    })
}

fn print_help() {
    println!(
        "subout - Convert proxy subscription to sing-box outbounds configuration.

Usage:
  subout -s <source> -o <output> [options]   Run CLI to export outbounds configuration.
  subout web [options]                       Start the web configuration management panel.
  subout -h | --help                         Show this help menu.

Required Parameters (CLI mode):
  -s <source>   Original subscription link (HTTP/HTTPS URL), file path, or raw base64/plaintext content.
  -o <output>   Output file path where the generated sing-box configuration will be saved.

Options:
  -v            Show verbose execution logs and optimization recommendations.
  -p, --port    Set the listening port for the web server (defaults to 1234 or PORT env var).
  -h, --help    Show this help menu."
    );
}

#[tokio::main]
async fn main() {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("{}", e);
            eprintln!("Run 'subout -h' or 'subout --help' for usage details.");
            std::process::exit(1);
        }
    };

    if args.help {
        print_help();
        return;
    }

    if args.web {
        if let Err(e) = subout::web::run_server(args.port).await {
            eprintln!("Web server error: {}", e);
            std::process::exit(1);
        }
    } else {
        if let Err(e) = run(args).await {
            eprintln!("{}", e);
            std::process::exit(1);
        }
    }
}

async fn run(args: CliArgs) -> Result<(), Box<dyn std::error::Error>> {
    // Validate that required options are provided
    if args.source.is_none() || args.output.is_none() {
        return Err("Error: Both subscription source (-s) and output file path (-o) must be specified.\nRun 'subout -h' for usage details.".into());
    }

    let source = args.source.as_ref().unwrap();
    let output_path = args.output.as_ref().unwrap();

    if args.verbose {
        eprintln!("[Info] Loading subscription from: {}", source);
    }

    let (content, source_type) = subout::load_subscription_content(source).await?;

    if args.verbose {
        eprintln!("[Info] Subscription source identified as: {}", source_type);
        eprintln!("[Info] Parsing subscription content...");
    }

    let (mut outbounds, skipped_announcements) =
        subout::parser::parse_subscription(&content, args.verbose);

    if args.verbose {
        eprintln!("[Info] Parsed {} active proxy node(s).", outbounds.len());
        if !skipped_announcements.is_empty() {
            eprintln!(
                "[Info] Filtered out {} announcement/info node(s):",
                skipped_announcements.len()
            );
            for ann in &skipped_announcements {
                eprintln!("  - {}", ann);
            }
        }
    }

    // Optimization check: Duplicate tags
    let mut tag_counts = std::collections::HashMap::new();
    let mut duplicate_count = 0;
    for outbound in outbounds.iter_mut() {
        let base_tag = outbound.tag().to_string();
        let count = tag_counts.entry(base_tag.clone()).or_insert(0);
        *count += 1;
        if *count > 1 {
            let new_tag = format!("{}-{}", base_tag, count);
            if args.verbose {
                eprintln!(
                    "[Optimization Hint] Duplicate tag '{}' found. Renamed to '{}' to ensure uniqueness in sing-box config.",
                    base_tag, new_tag
                );
            }
            outbound.set_tag(new_tag);
            duplicate_count += 1;
        }
    }

    if duplicate_count > 0 && !args.verbose {
        println!(
            "[Optimization Hint] Resolved {} duplicate tags to ensure configuration validity. Run with -v for details.",
            duplicate_count
        );
    }

    // Optimization check: Insecure TLS configurations
    let mut insecure_nodes = Vec::new();
    for outbound in &outbounds {
        if outbound.is_insecure() {
            insecure_nodes.push(outbound.tag().to_string());
        }
    }
    if !insecure_nodes.is_empty() {
        eprintln!(
            "[Security Optimization Warning] The following {} node(s) have 'allowInsecure' enabled, which may expose you to MITM attacks:",
            insecure_nodes.len()
        );
        if args.verbose {
            for node in &insecure_nodes {
                eprintln!("  - {}", node);
            }
        } else {
            eprintln!("  (Run with -v to list insecure nodes)");
        }
    }

    // Node count warning/hint
    if outbounds.is_empty() {
        eprintln!(
            "[Warning] No valid proxy outbounds parsed from subscription. Output config will only contain standard system outbounds."
        );
    } else if outbounds.len() > 50 && args.verbose {
        eprintln!(
            "[Optimization Hint] Found {} nodes. The generated config automatically creates a selector ('Proxy') and an auto speed-test group ('AUTO') that checks latency every 3 minutes.",
            outbounds.len()
        );
    }

    // Print node type statistics in verbose mode
    if args.verbose {
        let mut vmess_count = 0;
        let mut vless_count = 0;
        let mut ss_count = 0;
        let mut trojan_count = 0;
        let mut socks_count = 0;
        let mut http_count = 0;
        let mut anytls_count = 0;
        let mut hysteria_count = 0;
        let mut hysteria2_count = 0;
        for outbound in &outbounds {
            match outbound {
                subout::parser::Outbound::Vmess(_) => vmess_count += 1,
                subout::parser::Outbound::Vless(_) => vless_count += 1,
                subout::parser::Outbound::Shadowsocks(_) => ss_count += 1,
                subout::parser::Outbound::Trojan(_) => trojan_count += 1,
                subout::parser::Outbound::Socks(_) => socks_count += 1,
                subout::parser::Outbound::Http(_) => http_count += 1,
                subout::parser::Outbound::Anytls(_) => anytls_count += 1,
                subout::parser::Outbound::Hysteria(_) => hysteria_count += 1,
                subout::parser::Outbound::Hysteria2(_) => hysteria2_count += 1,
            }
        }
        eprintln!("[Info] Parsed nodes summary:");
        if vmess_count > 0 {
            eprintln!("  - VMess: {}", vmess_count);
        }
        if vless_count > 0 {
            eprintln!("  - VLESS: {}", vless_count);
        }
        if ss_count > 0 {
            eprintln!("  - Shadowsocks: {}", ss_count);
        }
        if trojan_count > 0 {
            eprintln!("  - Trojan: {}", trojan_count);
        }
        if socks_count > 0 {
            eprintln!("  - SOCKS: {}", socks_count);
        }
        if http_count > 0 {
            eprintln!("  - HTTP: {}", http_count);
        }
        if anytls_count > 0 {
            eprintln!("  - Anytls: {}", anytls_count);
        }
        if hysteria_count > 0 {
            eprintln!("  - Hysteria: {}", hysteria_count);
        }
        if hysteria2_count > 0 {
            eprintln!("  - Hysteria2: {}", hysteria2_count);
        }
    }

    // Format only the outbounds list as pretty JSON
    if args.verbose {
        eprintln!("[Info] Formatting outbounds list to JSON...");
    }

    let formatted_config = serde_json::to_string_pretty(&outbounds)?;

    if args.verbose {
        eprintln!(
            "[Info] Saving generated outbounds configuration to: {}",
            output_path
        );
    }

    let mut file = File::create(output_path)?;
    file.write_all(formatted_config.as_bytes())?;

    println!(
        "Success: Generated sing-box outbounds configuration with {} proxy outbounds and saved to '{}'.",
        outbounds.len(),
        output_path
    );

    Ok(())
}
