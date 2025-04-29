import moment from 'moment-timezone';
import config from '../config.cjs';

let statusWatcherInterval;

export async function startStatusWatcher(Matrix) {
    if (statusWatcherInterval) clearInterval(statusWatcherInterval);
    
    console.log("Starting status watcher...");
    
    // Initial status check
    await checkAndReactToStatuses(Matrix);
    
    // Set up periodic checking
    statusWatcherInterval = setInterval(
        () => checkAndReactToStatuses(Matrix),
        config.STATUS_VIEW_INTERVAL
    );
}

export function stopStatusWatcher() {
    if (statusWatcherInterval) {
        clearInterval(statusWatcherInterval);
        console.log("Stopped status watcher");
    }
}

async function checkAndReactToStatuses(Matrix) {
    try {
        console.log("Checking for new status updates...");
        
        // Fetch status updates
        const statusUpdates = await Matrix.fetchStatus(Matrix.user.id);
        
        if (statusUpdates && statusUpdates.length > 0) {
            console.log(`Found ${statusUpdates.length} status updates`);
            
            // Process each status (with limit)
            const limit = Math.min(statusUpdates.length, config.STATUS_VIEW_LIMIT);
            for (let i = 0; i < limit; i++) {
                const status = statusUpdates[i];
                
                // View the status (mark as seen)
                await Matrix.readMessages([status.key]);
                
                // Auto-react if enabled
                if (config.AUTO_STATUS_REACT === "true") {
                    await reactToStatus(Matrix, status);
                }
                
                // Add delay between processing statuses
                await new Promise(resolve => 
                    setTimeout(resolve, 1000)
                );
            }
        } else {
            console.log("No new status updates found");
        }
    } catch (error) {
        console.error("Error in status watcher:", error);
    }
}

async function reactToStatus(Matrix, status) {
    try {
        const randomEmoji = config.STATUS_REACT_EMOJIS[
            Math.floor(Math.random() * config.STATUS_REACT_EMOJIS.length)
        ];
        
        await Matrix.sendMessage(status.key.remoteJid, {
            react: {
                text: randomEmoji,
                key: status.key
            }
        });
        
        console.log(`Reacted to status with ${randomEmoji}`);
    } catch (error) {
        console.error("Failed to react to status:", error);
    }
}
