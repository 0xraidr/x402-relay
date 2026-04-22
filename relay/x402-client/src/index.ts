import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getOrCreateAssociatedTokenAccount,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";

function loadPayerKeypair(): Keypair {
  const inline = process.env.RELAY_PAYER_SECRET_KEY;
  if (inline) {
    return Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(inline) as number[])
    );
  }
  const rel =
    process.env.RELAY_PAYER_KEYPAIR_PATH ?? "./payer-wallet.json";
  const abs = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
  const raw = fs.readFileSync(abs, "utf-8");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(raw) as number[])
  );
}
  
  /** Body of HTTP 402 from x402-server (matches `accepts` in the 402 JSON). */
type PaymentRequirements402 = {
    x402Version: number;
    accepts: Array<{
      scheme: string;
      network: string;
      maxAmountRequired: string;
      resource: string;
      description: string;
      payTo: { address: string; asset: string };
      timeout: number;
    }>;
    error: string;
  };
                                                                                                             
  // ── Config ──────────────────────────────────────────────────────                                        
  const API_URL = "http://localhost:4000";                                                                   
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");                           
  const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");                        
                                                                                                             
  // Payer key: RELAY_PAYER_SECRET_KEY or RELAY_PAYER_KEYPAIR_PATH (see .env.example)
  const payer = loadPayerKeypair();
                                                                                                             
  async function main() {                                                                                    
    // ── Step 1: Hit the paid endpoint with no payment ──────────                                           
    console.log("1. Requesting /premium without payment...");                                                
    const firstResponse = await fetch(`${API_URL}/premium`);                                                 
                                                                                                             
    if (firstResponse.status !== 402) {                                                                      
      throw new Error(`Expected 402, got ${firstResponse.status}`);                                          
    }                                                                                                        
                                                                                                             
    const requirements = (await firstResponse.json()) as PaymentRequirements402;                                                         
    console.log("   Got 402 — payment required:");                                                           
    console.log(`   Amount: ${requirements.accepts[0].maxAmountRequired} atoms`);                            
    console.log(`   Pay to: ${requirements.accepts[0].payTo.address}`);                                      
                                                                                                             
    // ── Step 2: Build the USDC transfer transaction ─────────────                                          
    console.log("\n2. Building payment transaction...");                                                     
    const recipientWallet = new PublicKey(
        requirements.accepts[0].payTo.address
      );
      const recipientTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        recipientWallet
      );
  
      const payerTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        USDC_MINT,
        payer.publicKey
      );
  
      const amount = Number(requirements.accepts[0].maxAmountRequired);
  
      let recipientAccountExists = false;
      try {
        await getAccount(connection, recipientTokenAccount);
        recipientAccountExists = true;
      } catch {
        // ATA not created yet — we'll add createAssociatedTokenAccountInstruction below
      }
  
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
  
      const tx = new Transaction({
        feePayer: payer.publicKey,
        blockhash,
        lastValidBlockHeight,
      });
  
      if (!recipientAccountExists) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            payer.publicKey,
            recipientTokenAccount,
            recipientWallet,
            USDC_MINT
          )
        );
      }
  
      tx.add(
        createTransferInstruction(
          payerTokenAccount.address,
          recipientTokenAccount,
          payer.publicKey,
          amount
        )
      );                                                                                               
                                                                                                             
    // Sign but DON'T send — the facilitator will send it                                                    
    tx.sign(payer);                                                                                          
    console.log(`   Transaction signed (${tx.instructions.length} instruction)`);                            
                                                                                                             
    // ── Step 3: Create the payment header ────────────────────────                                         
    const paymentPayload = {                                                                                 
      x402Version: 1,                                                                                        
      scheme: "exact",                                                                                       
      network: "solana-devnet",                                                                              
      payload: {                                                                                             
        transaction: tx.serialize().toString("base64"),                                                      
      },                                                                                                     
    };                                                                                                       
                                                                                                             
    const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");                    
                                                                                                             
    // ── Step 4: Retry the endpoint with payment ─────────────────                                          
    console.log("\n3. Requesting /premium WITH payment...");                                                 
    const paidResponse = await fetch(`${API_URL}/premium`, {                                                 
      headers: {                                                                                             
        "X-Payment": paymentHeader,                                                                          
      },                                                                                                     
    });                                                                                                      
                                                                                                             
    console.log(`   Status: ${paidResponse.status}`);                                                        
    const result = await paidResponse.json();                                                                
                                                                                                             
    if (paidResponse.status === 200) {                                                                       
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");                                             
      console.log("SUCCESS — Premium content received!");                                                    
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");                                               
      console.log(JSON.stringify(result, null, 2));                                                          
    } else {                                                                                                 
      console.log("\nPayment failed:");                                                                      
      console.log(JSON.stringify(result, null, 2));                                                          
    }                                                                                                        
  }                                                                                                          
                                                                                                             
  main().catch(console.error);