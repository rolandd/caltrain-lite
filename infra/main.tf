terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

resource "cloudflare_workers_kv_namespace" "transit_kv" {
  account_id = var.cloudflare_account_id
  title      = "transit-kv"
}

resource "local_file" "wrangler_toml" {
  content = templatefile("${path.module}/../worker/wrangler.toml.tftpl", {
    kv_id = cloudflare_workers_kv_namespace.transit_kv.id
  })
  filename = "${path.module}/../worker/wrangler.toml"
}

output "kv_namespace_id" {
  value = cloudflare_workers_kv_namespace.transit_kv.id
}
