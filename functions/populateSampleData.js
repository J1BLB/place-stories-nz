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
    { PartitionKey:"posts", RowKey: "1", text:"Beautiful Milford Sound view", latitude:"-44.671", longitude:"166.762", author:"Sarah" },
    { PartitionKey:"posts", RowKey: "2", text:"Enjoying Auckland's waterfront", latitude:"-37.008", longitude:"174.785", author:"Mike" },
    { PartitionKey:"posts", RowKey: "3", text:"Hiking in Tongariro National Park", latitude:"-38.787", longitude:"175.547", author:"Emma" },
    { PartitionKey:"posts", RowKey: "4", text:"Wellington's creative district", latitude:"-41.286", longitude:"174.776", author:"James" },
    { PartitionKey:"posts", RowKey: "5", text:"Queenstown adventure capital", latitude:"-45.303", longitude:"168.738", author:"Lisa" }
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
