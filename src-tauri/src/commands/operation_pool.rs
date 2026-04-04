use crate::operation_pool::{PoolStatus, OPERATION_POOL};

#[tauri::command]
pub fn get_pool_status() -> Result<PoolStatus, String> {
    let pool = OPERATION_POOL
        .get()
        .ok_or_else(|| "Operation pool not initialized".to_string())?;
    Ok(pool.status())
}
