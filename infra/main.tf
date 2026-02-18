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
    zone_id = var.cloudflare_zone_id
    domain = var.domain
  })
  filename = "${path.module}/../worker/wrangler.toml"
}

resource "cloudflare_pages_project" "pwa" {
  account_id        = var.cloudflare_account_id
  name              = "transit-pwa"
  production_branch = "main"

  source {
    type = "github"
    config {
      owner                         = var.github_owner
      repo_name                     = var.github_repo
      production_branch             = "main"
      pr_comments_enabled           = true
      deployments_enabled           = true
      production_deployment_enabled = true
      preview_deployment_setting    = "all"
      preview_branch_includes       = ["*"]
    }
  }

  build_config {
    build_command   = "npm run build --prefix apps/pwa"
    destination_dir = "apps/pwa/build"
    root_dir        = ""
  }

  deployment_configs {
    production {
      environment_variables = {
        NODE_VERSION = "24"
      }
    }
    preview {
      environment_variables = {
        NODE_VERSION = "24"
      }
    }
  }
}

output "kv_namespace_id" {
  value = cloudflare_workers_kv_namespace.transit_kv.id
}
