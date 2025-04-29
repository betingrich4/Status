import moment from 'moment-timezone';
import config from '../config.cjs';

let bioUpdateInterval;

export async function initAutoBio(Matrix) {
    if (config.AUTO_BIO_ENABLED !== "true") return;
    
    if (bioUpdateInterval) clearInterval(bioUpdateInterval);
    
    console.log("Starting auto bio updates...");
    
    // Initial bio update
    await updateBio(Matrix);
    
    // Set up periodic updates
    bioUpdateInterval = setInterval(
        () => updateBio(Matrix),
        config.BIO_UPDATE_INTERVAL
    );
}

export function stopAutoBio() {
    if (bioUpdateInterval) {
        clearInterval(bioUpdateInterval);
        console.log("Stopped auto bio updates");
    }
}

async function updateBio(Matrix) {
    try {
        const now = moment().tz(config.TIME_ZONE || 'Africa/Nairobi');
        const randomEmoji = config.STATUS_REACT_EMOJIS[
            Math.floor(Math.random() * config.STATUS_REACT_EMOJIS.length)
        ];
        
        // Select a random template
        const template = config.BIO_TEMPLATES[
            Math.floor(Math.random() * config.BIO_TEMPLATES.length)
        ];
        
        // Replace placeholders
        let newBio = template
            .replace(/{time}/g, now.format('h:mm A'))
            .replace(/{date}/g, now.format('MMM D, YYYY'))
            .replace(/{randomEmoji}/g, randomEmoji);
        
        // Update profile status
        await Matrix.updateProfileStatus(newBio);
        
        console.log("Updated bio:", newBio);
    } catch (error) {
        console.error("Failed to update bio:", error);
    }
          }
