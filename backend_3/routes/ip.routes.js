const express = require('express');
const router = express.Router(); // สร้าง router ด้วย express.Router()


const ipDataCache = {
    data: null,
    timestamp: 0,
    ttl: 60000 * 5, // 5 minutes cache TTL
    
    isValid() {
      return this.data && (Date.now() - this.timestamp < this.ttl);
    },
    
    update(data) {
      this.data = data;
      this.timestamp = Date.now();
    }
  };
  

async function getIPsFromDB() {
    // Use caching for IP data
    if (ipDataCache.isValid()) {
      return ipDataCache.data;
    }
    
    try {
      const result = await pool.query(`
        SELECT 
          internet_protocol_id,
          internet_protocol_ip,
          internet_protocol_project,
          internet_protocol_latitude,
          internet_protocol_longtitude
        FROM internet_protocols
        WHERE internet_protocol_ip IS NOT NULL AND internet_protocol_ip != ''
        ORDER BY internet_protocol_id
        LIMIT 5
      `);
      
      ipDataCache.update(result.rows);
      return result.rows;
    } catch (error) {
      console.error('Database query error:', error);
      return [];
    }
  }

// เพิ่มฟังก์ชันสำหรับ route
router.post('/check-ips', async (req, res) => {
    try {
        const startTime = Date.now();
        const ips = await getIPsFromDB();
        
        if (!ips || ips.length === 0) {
          return res.status(404).json({ error: 'No IPs found' });
        }
        
        console.log(`Retrieved ${ips.length} IPs from database in ${Date.now() - startTime}ms`);
        
        // Create batches of IPs for parallel processing
        const batches = [];
        for (let i = 0; i < ips.length; i += BATCH_SIZE) {
          batches.push(ips.slice(i, i + BATCH_SIZE));
        }
        
        console.log(`Processing ${batches.length} batches with batch size ${BATCH_SIZE}`);
        
        const results = {};
        
        // Process batches with concurrency control
        const processBatches = async () => {
          // Process batches in chunks to avoid overloading the system
          const concurrentBatches = Math.min(MAX_CONCURRENT_PINGS / BATCH_SIZE, batches.length);
          
          for (let i = 0; i < batches.length; i += concurrentBatches) {
            const batchPromises = batches
              .slice(i, i + concurrentBatches)
              .map(batch => processBatchInWorker(batch));
            
            const batchResults = await Promise.all(batchPromises);
            
            // Merge batch results
            batchResults.forEach(batchResult => {
              Object.assign(results, batchResult);
            });
            
            // Log progress
            console.log(`Processed ${Math.min((i + concurrentBatches), batches.length)} of ${batches.length} batches`);
          }
        };
        
        await processBatches();
        
        const totalTime = Date.now() - startTime;
        console.log(`Total processing time: ${totalTime}ms for ${Object.keys(results).length} IPs`);
        
        res.json({
          results,
          timestamp: Date.now(),
          count: Object.keys(results).length,
          processingTime: totalTime
        });
      } catch (error) {
        console.error('Error in check-ips:', error);
        res.status(500).json({ error: 'Server error', message: error.message });
      }
});

// ส่ง router กลับไปให้ `server.js` ใช้
module.exports = router;
