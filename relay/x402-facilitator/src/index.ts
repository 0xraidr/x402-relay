import "dotenv/config";
import fs from "fs";
import path from "path";
import { Hono } from "hono";
import {
  Connection,
  Transaction,
  PublicKey,
  Keypair,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { serve } from "@hono/node-server";

function loadFacilitatorKeypair(): Keypair {
  const inline = process.env.RELAY_FACILITATOR_SECRET_KEY;
  if (inline) {
    return Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(inline) as number[])
    );
  }
  const rel =
    process.env.RELAY_FACILITATOR_KEYPAIR_PATH ?? "./facilitator-wallet.json";
  const abs = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
  const raw = fs.readFileSync(abs, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
}

const app = new Hono();
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

// Fund this wallet on devnet (see .env.example for keypair env vars)
const feePayer = loadFacilitatorKeypair();

const USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

// ─── GET /supported ─────────────────────────────────────────────
app.get("/supported", (c) => {                                              
     return c.json({                                                           
       x402Version: 1,                                                         
       schemes: ["exact"],                                                     
       networks: ["solana-devnet"],                                            
       feePayer: feePayer.publicKey.toBase58(),                                
     });                                                                       
   });                                                                         
                                                                               
   // ─── POST /verify ───────────────────────────────────────────────         
   // "Is this payment legitimate? Don't collect money yet."                   
   app.post("/verify", async (c) => {                                          
     try {                                                                     
       const body = await c.req.json();                                        
       const { payload } = body;                                               
                                                                               
       const txBuffer = Buffer.from(payload.transaction, "base64");            
       const tx = Transaction.from(txBuffer);                                  
                                                                               
       // 1. Find the SPL Token Transfer instruction                           
       let validTransfer = false;                                              
       let transferAmount = 0n;                                                
                                                                               
       for (const ix of tx.instructions) {                                     
         if (ix.programId.equals(TOKEN_PROGRAM_ID)) {                          
           // Transfer instruction: data[0] === 3, data[1-8] = amount (u64 LE) 
           if (ix.data.length >= 9 && ix.data[0] === 3) {                      
             transferAmount = ix.data.readBigUInt64LE(1);                      
             if (ix.keys.length >= 2) {                                        
               // We'd check the destination here in a real impl               
               // For now, just note that a transfer exists                    
               validTransfer = true;                                           
               break;                                                          
             }                                                                 
           }                                                                   
         }                                                                     
       }                                                                       
                                                                               
       if (!validTransfer) {                                                   
         return c.json({ isValid: false, invalidReason: "NO_USDC_TRANSFER" }); 
       }                                                                       
                                                                               
       // 2. Simulate the transaction (preflight — don't broadcast)            
       const simulation = await connection.simulateTransaction(tx);            
       if (simulation.value.err) {                                             
         return c.json({                                                       
           isValid: false,                                                     
           invalidReason: "SIMULATION_FAILED",                                 
           details: simulation.value.err,                                      
         });                                                                   
       }                                                                       
                                                                               
       return c.json({ isValid: true });                                       
     } catch (err) {                                                           
       return c.json({                                                         
         isValid: false,                                                       
         invalidReason: err instanceof Error ? err.message : "UNKNOWN",        
       });                                                                     
     }                                                                         
   });                                                                         
                                                                               
   // ─── POST /settle ───────────────────────────────────────────────         
   // "Collect this payment on-chain now."                                     
   app.post("/settle", async (c) => {                                          
     try {                                                                     
       const body = await c.req.json();                                        
       const { payload } = body;                                               
                                                                               
       const txBuffer = Buffer.from(payload.transaction, "base64");            
                                                                               
       // Submit the signed transaction to Solana                              
       const signature = await connection.sendRawTransaction(txBuffer, {       
         skipPreflight: false,                                                 
         preflightCommitment: "confirmed",                                     
       });                                                                     
                                                                               
       // Wait for confirmation                                                
       const confirmation = await connection.confirmTransaction(               
         signature,                                                            
         "confirmed"                                                           
       );                                                                      
                                                                               
       if (confirmation.value.err) {                                           
         return c.json({                                                       
           success: false,                                                     
           errorReason: "ON_CHAIN_FAILED",                                     
           details: confirmation.value.err,                                    
         });                                                                   
       }                                                                       
                                                                               
       return c.json({ success: true, txSignature: signature });               
     } catch (err) {                                                           
       return c.json({                                                         
         success: false,                                                       
         errorReason: err instanceof Error ? err.message : "UNKNOWN",          
       });                                                                     
     }                                                                         
   });                                                                         
                                                                               
   // ─── Start ──────────────────────────────────────────────────────         
   const port = 3000;                                                          
   console.log(`Facilitator running on :${port}`);                             
                                                                               
   export default app;                                                         
                                                                                                               
   serve({ fetch: app.fetch, port });        