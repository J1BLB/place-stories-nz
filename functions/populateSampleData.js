const { TableClient } = require("@azure/data-tables");

(async ()=> {
  const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
  const tableName = process.env.TABLE_NAME || "GeoPosts";
  if (!conn) {
    console.error("TABLE_CONNECTION_STRING not set");
    process.exit(1);
  }
  const client = TableClient.fromConnectionString(conn, tableName, { allowInsecureConnection: true });
  try {
    await client.createTable();
  } catch(e) {}
const sample = [
    { PartitionKey:"posts", RowKey: "1", text:"Beautiful Milford Sound view", latitude:"-44.6719", longitude:"166.7626", author:"Sarah" },
    { PartitionKey:"posts", RowKey: "2", text:"Enjoying Auckland's waterfront", latitude:"-37.0082", longitude:"174.7850", author:"Mike" },
    { PartitionKey:"posts", RowKey: "3", text:"Hiking in Tongariro National Park", latitude:"-38.7870", longitude:"175.5470", author:"Emma" },
    { PartitionKey:"posts", RowKey: "4", text:"Wellington's creative district", latitude:"-41.2865", longitude:"174.7762", author:"James" },
    { PartitionKey:"posts", RowKey: "5", text:"Queenstown adventure capital", latitude:"-45.3033", longitude:"168.7383", author:"Lisa" }
  ];
  for (const e of sample) {
    try {
      await client.createEntity(e);
      console.log("Inserted", e.RowKey);
    } catch(err){
      console.error('Insert failed', e.RowKey, err.message || err);
    }
  }
  console.log('Done');
})();
