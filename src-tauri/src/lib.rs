mod commands;
mod git;
mod orchestrator;
mod claude;
mod config;
mod logging;
mod operation_pool;
mod telemetry;

/// Create a Command with CREATE_NO_WINDOW on Windows to prevent console flashing
/// when the app runs as a GUI (production builds).
pub fn no_window_command(program: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

pub fn run() {
    let pool_config = operation_pool::PoolConfig::load().unwrap_or_default();
    let persisted_limits = operation_pool::PersistedLimits::load().unwrap_or_default();
    let _ = operation_pool::OPERATION_POOL
        .set(operation_pool::OperationPool::new(pool_config, persisted_limits));
    operation_pool::OPERATION_POOL.get().unwrap().start_tick_loop();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::project::list_projects,
            commands::project::add_project,
            commands::project::remove_project,
            commands::project::get_current_branch,
            commands::project::set_active_project,
            commands::project::get_active_project,
            commands::git::get_git_status,
            commands::git::get_git_diff,
            commands::git::get_file_diff_content,
            commands::git::git_stage,
            commands::git::git_unstage,
            commands::git::git_stage_all,
            commands::git::git_unstage_all,
            commands::git::git_commit,
            commands::git::git_push,
            commands::git::git_pull,
            commands::git::git_create_branch,
            commands::git::git_switch_branch,
            commands::git::git_list_branches,
            commands::git::git_discard_file,
            commands::git::git_delete_untracked_file,
            commands::git::git_merge,
            commands::git::git_rebase,
            commands::git::git_undo_last_commit,
            commands::git::git_delete_branch,
            commands::git::git_stash,
            commands::git::git_stash_pop,
            commands::git::git_fetch,
            commands::git::git_revert_last_push,
            commands::flow::list_flows,
            commands::flow::get_flow,
            commands::flow::execute_flow,
            commands::claude::generate_slug,
            commands::claude::start_session,
            commands::claude::send_message,
            commands::claude::send_message_with_images,
            commands::claude::read_file_base64,
            commands::claude::get_session_status,
            commands::claude::interrupt_session,
            commands::claude::set_session_model,
            commands::claude::stop_session,
            commands::claude::list_claude_sessions,
            commands::claude::respond_to_permission,
            commands::claude::add_permission_rule,
            commands::claude::run_claude_cli,
            commands::claude::query_claude_status,
            commands::config::get_config,
            commands::config::set_config,
            commands::config::scaffold_shared_repo,
            commands::config::check_for_update,
            commands::worktree::list_worktrees,
            commands::worktree::create_worktree,
            commands::worktree::remove_worktree,
            commands::worktree::clean_worktrees,
            commands::worktree::create_session,
            commands::worktree::list_sessions,
            commands::worktree::close_session,
            commands::worktree::close_all_sessions,
            commands::worktree::get_branches_for_repo,
            commands::worktree::setup_worktree_deps,
            commands::window::open_claude_window,
            commands::window::open_breakout_window,
            commands::window::close_breakout_window,
            commands::filesystem::list_directory_recursive,
            commands::filesystem::read_file_content,
            commands::filesystem::write_file_content,
            commands::filesystem::get_language_stats,
            commands::filesystem::list_claude_commands,
            commands::filesystem::resolve_claude_command,
            commands::logging::log_event,
            commands::logging::get_logs,
            commands::logging::clear_logs,
            commands::chat_history::create_chat_session,
            commands::chat_history::end_chat_session,
            commands::chat_history::save_chat_message,
            commands::chat_history::list_chat_sessions,
            commands::chat_history::get_chat_messages,
            commands::chat_history::update_chat_session_title,
            commands::chat_history::update_chat_session_summary,
            commands::chat_history::generate_chat_title,
            commands::chat_history::generate_chat_summary,
            commands::chat_history::delete_chat_session,
            commands::chat_history::delete_chat_history_for_worktree,
            commands::chat_history::delete_chat_history_for_project,
            commands::chat_history::cleanup_agent_sessions,
            commands::account::open_login_window,
            commands::account::fetch_claude_usage,
            commands::account::has_claude_session,
            commands::account::clear_claude_session,
            commands::account::trigger_cli_login,
            commands::account::start_usage_polling,
            commands::account::stop_usage_polling,
            commands::skills::list_buildor_skills,
            commands::skills::get_buildor_skill,
            commands::skills::list_project_skills,
            commands::skills::save_buildor_skill,
            commands::skills::delete_buildor_skill,
            commands::skills::index_skills,
            commands::agents::spawn_agent,
            commands::agents::kill_agent,
            commands::agents::extend_agent,
            commands::agents::update_agent_health,
            commands::agents::check_agent_alive,
            commands::agents::list_agents,
            commands::agents::clear_agents_for_parent,
            commands::agents::get_agent_status,
            commands::agents::inject_into_agent,
            commands::agents::mark_agent_exited,
            commands::agents::takeover_agent,
            commands::shell::execute_shell_command,
            commands::chat_images::save_chat_image,
            commands::chat_images::read_chat_image,
            commands::chat_images::delete_session_images,
            commands::mailbox::deposit_result,
            commands::mailbox::query_result,
            commands::mailbox::query_results_by_parent,
            commands::mailbox::query_result_by_name,
            commands::mailbox::update_agent_draft,
            commands::mailbox::purge_results,
            commands::mailbox::spawn_agent_with_deps,
            commands::operation_pool::get_pool_status,
            commands::telemetry::subscribe_telemetry,
            commands::telemetry::unsubscribe_telemetry,
        ])
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(pool) = crate::operation_pool::OPERATION_POOL.get() {
                    pool.shutdown();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
