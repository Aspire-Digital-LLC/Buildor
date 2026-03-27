mod commands;
mod git;
mod orchestrator;
mod claude;
mod config;
mod logging;

pub fn run() {
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
            commands::claude::start_session,
            commands::claude::send_message,
            commands::claude::get_session_status,
            commands::config::get_config,
            commands::config::set_config,
            commands::worktree::list_worktrees,
            commands::worktree::create_worktree,
            commands::worktree::remove_worktree,
            commands::worktree::clean_worktrees,
            commands::window::open_breakout_window,
            commands::window::close_breakout_window,
            commands::filesystem::list_directory_recursive,
            commands::filesystem::read_file_content,
            commands::logging::log_event,
            commands::logging::get_logs,
            commands::logging::clear_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
