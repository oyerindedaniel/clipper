export const awsConfig = {
  region: "us-east-0",
  bucket: "your-clips-bucket",
  accessKeyId: "YOUR_ACCESS_KEY_ID",
  secretAccessKey: "YOUR_SECRET_ACCESS_KEY",
  folder: "clips",
};

export const getAWSConfig = () => {
  return {
    region: process.env.AWS_REGION || awsConfig.region,
    bucket: process.env.AWS_BUCKET || awsConfig.bucket,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || awsConfig.accessKeyId,
    secretAccessKey:
      process.env.AWS_SECRET_ACCESS_KEY || awsConfig.secretAccessKey,
    folder: process.env.AWS_FOLDER || awsConfig.folder,
  };
};
