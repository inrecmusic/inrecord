-- Meta CAPI：結帳擷取的準識別資料快照（fbp/fbc/ip/ua），僅 server 讀寫
alter table orders add column if not exists capi_data jsonb;
