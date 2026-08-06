# Step-by-Step Azure Portal Deployment Guide for Azure Durable Functions

This guide provides step-by-step instructions to create, configure, and deploy your **Azure Durable Function** app (`azure-email-function/`) on the **Azure Portal**, and link it with your **Vercel** production deployment.

---

## Overview of Architecture
* **Vercel**: Hosts the React Frontend SPA and Express API (`backend/`).
* **Azure Function App**: Hosts the email-sending microservice and Durable Orchestrator (`azure-email-function/`).
* **Azure Storage Account**: Stores state, queues, and history for Azure Durable Functions orchestrations.
* **Supabase PostgreSQL**: Shared database connection between Vercel and Azure.

---

## Step 1: Create an Azure Storage Account (Required for Durable Functions)

Azure Durable Functions use Azure Storage to track state and handle timer orchestration.

1. Log in to the [Azure Portal](https://portal.azure.com/).
2. In the top search bar, search for **Storage accounts** and select it.
3. Click **+ Create** (or **+ New**).
4. Fill in the **Basics** tab:
   * **Subscription**: Select your active Azure subscription.
   * **Resource Group**: Select an existing resource group or click **Create new** (e.g. `rg-desire-mail-prod`).
   * **Storage account name**: Enter a unique name (lowercase letters and numbers only, e.g. `stdesireemailprod`).
   * **Region**: Select the region closest to your users (e.g. `East US` or `West Europe`).
   * **Primary service**: Azure Blob Storage or Azure Data Lake Storage v2.
   * **Performance**: Standard.
   * **Redundancy**: Locally-redundant storage (LRS).
5. Click **Review + Create**, then click **Create**. Wait for deployment to complete.

---

## Step 2: Create the Azure Function App

1. In the Azure Portal search bar, search for **Function App** and select it.
2. Click **+ Create**.
3. Choose Hosting Option:
   * Select **Select** under **Consumption (Serverless)** (or **Flex Consumption**).
4. Fill in the **Basics** tab:
   * **Subscription**: Select your Azure subscription.
   * **Resource Group**: Select `rg-desire-mail-prod`.
   * **Function App Name**: Enter a unique name, e.g. `func-desire-email-prod`.  
     *(Your function endpoint will be `https://func-desire-email-prod.azurewebsites.net`)*.
   * **Do you want to deploy code or container image?**: Select **Code**.
   * **Runtime stack**: Select **Node.js**.
   * **Version**: Select **18 LTS** or **20 LTS**.
   * **Operating System**: Select **Linux** (Recommended for Node.js).
5. Fill in the **Storage** tab:
   * **Storage account**: Select the storage account created in Step 1 (`stdesireemailprod`).
6. Fill in the **Monitoring** tab:
   * **Enable Application Insights**: Select **Yes** (creates an Application Insights resource for real-time logs and telemetry).
7. Click **Review + Create**, then click **Create**. Wait 1–2 minutes for the resource creation to finish.

---

## Step 3: Configure Environment Variables (App Settings)

Your Azure Function needs database credentials, email gateway keys, and secret authentication tokens.

1. Open your newly created Function App (`func-desire-email-prod`) in Azure Portal.
2. In the left navigation menu under **Settings**, click **Environment variables** (or **Configuration**).
3. Under the **App settings** tab, click **+ Add** to create each of the following environment variables:

| Name | Sample Value | Description |
| :--- | :--- | :--- |
| `AZURE_FUNCTION_SECRET_KEY` | `MySuperSecretKey_987654321` | Secret token shared between Vercel API and Azure Function. |
| `DATABASE_URL` | `postgresql://postgres.xxx:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true` | Supabase pooled connection string. |
| `DIRECT_URL` | `postgresql://postgres.xxx:pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres` | Supabase direct connection string. |
| `SMTP_HOST` | `email-smtp.us-east-1.amazonaws.com` | SMTP Server Host (AWS SES / Gmail / custom). |
| `SMTP_PORT` | `587` | SMTP Port. |
| `SMTP_USER` | `AKIAIOSFODNN7EXAMPLE` | SMTP Access Key / Username. |
| `SMTP_PASS` | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` | SMTP Secret Key / Password. |
| `FROM_EMAIL` | `"Desire Marketing" <noreply@yourdomain.com>` | Sender Email Address. |
| `FRONTEND_URL` | `https://your-app.vercel.app` | URL of your deployed Vercel frontend. |

4. Click **Apply** at the bottom of the form, then click **Apply** / **Save** at the top of the Environment Variables page.

---

## Step 4: Deploy the Code to Azure Function App

You can deploy the code from your local machine using one of three simple methods:

### Method A: Azure Functions Core Tools CLI (Recommended & Fastest)

1. Open your terminal/command prompt.
2. Navigate to the `azure-email-function` directory:
   ```bash
   cd c:\Desire-Mail-Marketing-Sharepoint\azure-email-function
   ```
3. Install dependencies and generate Prisma client:
   ```bash
   npm install
   npx prisma generate --schema=../backend/prisma/schema.prisma
   ```
4. Log in to Azure CLI:
   ```bash
   az login
   ```
5. Publish to your Azure Function App:
   ```bash
   func azure functionapp publish func-desire-email-prod
   ```

---

### Method B: Deploy via VS Code Extension

1. Open VS Code.
2. Install the **Azure Functions** extension (by Microsoft) from the VS Code Extensions marketplace (`Ctrl+Shift+X`).
3. Click the **Azure** icon on the VS Code left sidebar.
4. Click **Sign in to Azure...** and log in.
5. Under **RESOURCES** -> **Workspace** / **Subscription**, expand **Function App**.
6. Right-click your Function App (`func-desire-email-prod`) and select **Deploy to Function App...**.
7. Select the folder `c:\Desire-Mail-Marketing-Sharepoint\azure-email-function`.
8. Click **Deploy** when prompted for confirmation.

---

### Method C: Automated Deployment via GitHub Actions (CI/CD)

1. In Azure Portal, open your Function App (`func-desire-email-prod`).
2. In the left menu under **Deployment**, click **Deployment Center**.
3. Under **Source**, select **GitHub**.
4. Authorize Azure to connect to your GitHub account.
5. Select your **Organization**, **Repository** (`Desire-Mail-Marketing-Sharepoint`), and **Branch** (`main`).
6. Click **Save**. Azure will automatically generate a GitHub Actions workflow file in your repository (`.github/workflows/main_func-desire-email-prod.yml`) that deploys every push automatically!

---

## Step 5: Configure Vercel to Call Azure Function App

Now configure your Vercel Express API backend so it knows where to send campaign requests.

1. Log in to your [Vercel Dashboard](https://vercel.com/dashboard).
2. Click on your project -> **Settings** -> **Environment Variables**.
3. Add the following environment variables:
   * **`AZURE_FUNCTION_URL`**: `https://func-desire-email-prod.azurewebsites.net`  
     *(Replace with your exact Function App URL from Azure Portal)*
   * **`AZURE_FUNCTION_SECRET_KEY`**: `MySuperSecretKey_987654321`  
     *(Must match the exact string set in Step 3)*
4. Click **Save**.
5. Trigger a **Redeploy** on Vercel so the new environment variables take effect.

---

## Step 6: Verify Deployment in Azure Portal

1. Go to Azure Portal -> **Function App** -> `func-desire-email-prod`.
2. In the left menu under **Functions**, click **Functions**.
3. You should see all 7 functions listed:
   * `startCampaignOrchestrator` (HTTP Trigger)
   * `emailCampaignOrchestrator` (Durable Orchestration)
   * `getCampaignDataActivity` (Durable Activity)
   * `sendBatchActivity` (Durable Activity)
   * `updateCampaignStatsActivity` (Durable Activity)
   * `finalizeCampaignActivity` (Durable Activity)
   * `scheduledCampaignPoller` (Timer Trigger)
4. To check real-time logs:
   * Click on **Log stream** in the left menu under **Monitoring**.
   * Or open **Application Insights** to view full execution traces and performance metrics.

---

## Testing End-to-End Execution
1. Open your Vercel React web application in browser.
2. Go to **Campaigns** -> Create or select a campaign -> Click **Schedule Campaign** or **Send Now**.
3. Check Azure Function **Log Stream**:
   * You will see `startCampaignOrchestrator` receive the request.
   * `emailCampaignOrchestrator` starts.
   * If scheduled for the future, `createTimer` puts the orchestrator to sleep until the scheduled time.
   * Once triggered, batch activity sends emails and updates Supabase database counts.
