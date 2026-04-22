import { Hono } from "hono";                                                                               
import { serve } from "@hono/node-server";                                                                 
                                                                                                              
type Variables = {
    payment: { signature: string };
  };
  
  const app = new Hono<{ Variables: Variables }>();                                                                                
                                                                                                              
   // ── Config ──────────────────────────────────────────────────────                                        
   const FACILITATOR_URL = "http://localhost:3000";                                                           
   const TREASURY = "8DmWq73bfjEfai7igsoY99n8KjHPpZuNyYVqsihoT4Y6"; // where USDC lands — use the same                                 
                            
   const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";                                          
                                                                                                              
   // Define what this endpoint costs                                                                         
   const PRICING = {                                                                                          
     "GET /premium": {                                                                                        
       price: "$0.0001",       // human-readable (not used in protocol, just docs)                            
       amountAtoms: "100",     // 0.0001 USDC in atomic units (6 decimals)                                    
       network: "solana-devnet",                                                                              
       description: "Premium data access",                                                                    
     },                                                                                                       
   };  
   
   type FacilitatorVerifyResponse =
  | { isValid: true }
  | { isValid: false; invalidReason: string };

    type FacilitatorSettleResponse =
    | { success: true; txSignature: string }
    | { success: false; errorReason: string };
                                                                                                              
   // ── x402 Middleware ─────────────────────────────────────────────                                        
   const x402Middleware = async (c: any, next: any) => {                                                      
     const routeKey = `${c.req.method} ${c.req.path}`;                                                        
     const pricing = PRICING[routeKey as keyof typeof PRICING];                                               
                                                                                                              
     // Not a paid route — pass through                                                                       
     if (!pricing) return next();                                                                             
                                                                                                              
     // Check for payment header (v1: X-Payment, v2: PAYMENT-SIGNATURE)                                       
     const rawPayment = c.req.header("x-payment") || c.req.header("payment-signature");                       
                                                                                                              
     // ── No payment → return 402 ────────────────────────────────                                           
     if (!rawPayment) {                                                                                       
       return c.json(                                                                                         
         {                                                                                                    
           x402Version: 1,                                                                                    
           accepts: [                                                                                         
             {                                                                                                
               scheme: "exact",                                                                               
               network: pricing.network,                                                                      
               maxAmountRequired: pricing.amountAtoms,                                                        
               resource: routeKey,                                                                            
               description: pricing.description,                                                              
               payTo: {                                                                                       
                 address: TREASURY,                                                                           
                 asset: USDC_MINT,                                                                            
               },                                                                                             
               timeout: 300,                                                                                  
             },                                                                                               
           ],                                                                                                 
           error: "Payment Required",                                                                         
         },                                                                                                   
         402                                                                                                  
       );                                                                                                     
     }                                                                                                        
                                                                                                              
     // ── Payment present → verify + settle with facilitator ────                                            
     const paymentPayload = JSON.parse(                                                                       
       Buffer.from(rawPayment, "base64").toString("utf-8")                                                    
     );                                                                                                       
                                                                                                              
     // 1. Verify                                                                                             
     const verifyRes = await fetch(`${FACILITATOR_URL}/verify`, {                                             
       method: "POST",                                                                                        
       headers: { "Content-Type": "application/json" },                                                       
       body: JSON.stringify({                                                                                 
         payload: paymentPayload.payload,                                                                     
         scheme: "exact",                                                                                     
         network: pricing.network,                                                                            
       }),                                                                                                    
     });           

     const verified = (await verifyRes.json()) as FacilitatorVerifyResponse;                                                                 
                                                                                                              
     if (!verified.isValid) {                                                                                 
       return c.json(                                                                                         
         { error: "Payment invalid", reason: verified.invalidReason },                                        
         402                                                                                                  
       );                                                                                                     
     }                                                                                                        
                                                                                                              
     // 2. Settle                                                                                             
     const settleRes = await fetch(`${FACILITATOR_URL}/settle`, {                                             
       method: "POST",                                                                                        
       headers: { "Content-Type": "application/json" },                                                       
       body: JSON.stringify({                                                                                 
         payload: paymentPayload.payload,                                                                     
         scheme: "exact",                                                                                     
         network: pricing.network,                                                                            
       }),                                                                                                    
     });                                                                                                      
     const settled = (await settleRes.json()) as FacilitatorSettleResponse;                                                                
                                                                                                              
     if (!settled.success) {                                                                                  
       return c.json(                                                                                         
         { error: "Settlement failed", reason: settled.errorReason },                                         
         402                                                                                                  
       );                                                                                                     
     }                                                                                                        
                                                                                                              
     // 3. Attach payment info and continue                                                                   
     c.set("payment", { signature: settled.txSignature });                                                    
     return next();                                                                                           
   };                                                                                                         
                                                                                                              
   app.use("*", x402Middleware);                                                                              
                                                                                                              
   // ── Routes ─────────────────────────────────────────────────────                                         
                                                                                                              
   // Free endpoint                                                                                           
   app.get("/", (c) => c.json({ message: "This is free" }));                                                  
                                                                                                              
   // Paid endpoint                                                                                           
   app.get("/premium", (c) => {                                                                               
     const payment = c.get("payment");                                                                        
     return c.json({                                                                                          
       message: "🎉 Premium content!",                                                                        
       data: { secret: "the treasure", timestamp: new Date().toISOString() },                                 
       payment: {                                                                                             
         signature: payment.signature,                                                                        
         explorer: `https://explorer.solana.com/tx/${payment.signature}?cluster=devnet`,                      
       },                                                                                                     
     });                                                                                                      
   });                                                                                                        
                                                                                                              
   // ── Start ──────────────────────────────────────────────────────                                         
   const port = 4000;                                                                                         
   console.log(`Server running on :${port}`);                                                                 
   serve({ fetch: app.fetch, port });