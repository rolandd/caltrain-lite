# SPDX-License-Identifier: MIT
# Copyright 2026 Roland Dreier <roland@rolandd.dev>

terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
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

resource "cloudflare_d1_database" "transit_d1" {
  account_id = var.cloudflare_account_id
  name       = "transit-d1"
  read_replication = {
    mode = "disabled"
  }
}

resource "local_file" "wrangler_toml" {
  content = templatefile("${path.module}/../worker/wrangler.toml.tftpl", {
    kv_id = cloudflare_workers_kv_namespace.transit_kv.id
    d1_id = cloudflare_d1_database.transit_d1.id
    zone_id = var.cloudflare_zone_id
    domain = var.domain
  })
  filename = "${path.module}/../worker/wrangler.toml"
}

resource "cloudflare_pages_project" "pwa" {
  account_id        = var.cloudflare_account_id
  name              = "transit-pwa"
  production_branch = "main"

  source = {
    type = "github"
    config = {
      owner                         = var.github_owner
      repo_name                     = var.github_repo
      production_branch             = "main"
      pr_comments_enabled           = false
      production_deployment_enabled = true
      preview_deployment_setting    = "none"
      path_excludes                 = ["data/*", ".github/*", "docs/*"]
    }
  }

  build_config = {
    build_command   = "pnpm --filter pwa build"
    destination_dir = "apps/pwa/build"
    root_dir        = ""
  }

  deployment_configs = {
    production = {
      environment_variables = {
        NODE_VERSION  = "24"
        PNPM_VERSION  = "11"
        PUBLIC_DOMAIN = "https://${var.domain}"
      }
    }
    preview = {
      environment_variables = {
        NODE_VERSION  = "24"
        PNPM_VERSION  = "11"
        PUBLIC_DOMAIN = "https://${var.domain}"
      }
    }
  }
}

output "kv_namespace_id" {
  value = cloudflare_workers_kv_namespace.transit_kv.id
}
